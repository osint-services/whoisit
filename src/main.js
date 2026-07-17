import { app, BrowserWindow, ipcMain } from 'electron';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import started from 'electron-squirrel-startup';

const {
  getConfiguredIntegrations,
  updateEnvContent,
} = require('./integrationConfig.cjs');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const findPlatformRoot = () => {
  const candidates = [
    app.getAppPath(),
    path.resolve(app.getAppPath(), '..'),
    path.resolve(app.getAppPath(), '..', '..'),
    path.resolve(app.getAppPath(), '..', '..', '..'),
    path.resolve(app.getAppPath(), '..', '..', '..', '..'),
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'docker-compose.yml')) && existsSync(path.join(candidate, 'scripts', 'start.sh'))) {
      return candidate;
    }
  }

  return path.resolve(app.getAppPath(), '..', '..', '..');
};

const platformRoot = findPlatformRoot();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const buildPathEnv = () => {
  const defaultPaths = ['/usr/bin', '/usr/local/bin', '/snap/bin'];
  const pathEntries = [...new Set([...(process.env.PATH || '').split(path.delimiter), ...defaultPaths])];
  return pathEntries.filter(Boolean).join(path.delimiter);
};

const getDockerCommand = () => {
  const candidates = [
    process.env.DOCKER_BIN,
    process.env.DOCKER,
    '/usr/bin/docker',
    '/usr/local/bin/docker',
    '/snap/bin/docker',
    'docker',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === 'docker') {
      continue;
    }
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return 'docker';
};

const probeEndpoint = (url) => {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const request = client.get(url, { timeout: 3000 }, (response) => {
      response.resume();
      const status = response.statusCode || 0;
      resolve({ ok: status >= 200 && status < 300, status });
    });

    request.on('timeout', () => {
      request.destroy(new Error('timeout'));
    });

    request.on('error', () => {
      resolve({ ok: false });
    });
  });
};

const checkPlatformAvailability = async () => {
  const probeUrls = [
    'http://127.0.0.1:80/scan/healthz',
    'http://127.0.0.1:80/focus/readyz',
    'http://127.0.0.1:80/phone_search/healthz',
    'http://127.0.0.1:80/datasets/healthz',
  ];

  for (const probeUrl of probeUrls) {
    const result = await probeEndpoint(probeUrl);
    if (!result.ok) {
      return {
        ready: false,
        message: result.status
          ? `A platform service is not ready (HTTP ${result.status}).`
          : 'A platform service is not reachable.',
      };
    }
  }

  return { ready: true, message: 'Platform services are reachable.' };
};

const envPath = path.join(platformRoot, '.env');

const readIntegrationConfiguration = async () => {
  try {
    return await fs.readFile(envPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
};

const checkIntegrations = async () => {
  const configured = getConfiguredIntegrations(
    await readIntegrationConfiguration(),
  );
  const [x, twilio, datasets] = await Promise.all([
    probeEndpoint('http://127.0.0.1:80/focus/readyz'),
    probeEndpoint('http://127.0.0.1:80/phone_search/healthz'),
    probeEndpoint('http://127.0.0.1:80/datasets/healthz'),
  ]);
  return {
    platformRootAvailable: existsSync(path.join(platformRoot, 'docker-compose.yml')),
    integrations: [
      {
        id: 'x',
        name: 'X API',
        client: 'Tweepy',
        configured: configured.x,
        reachable: x.ok,
        statusCode: x.status || null,
      },
      {
        id: 'twilio',
        name: 'Twilio Lookup',
        client: 'Twilio SDK',
        configured: configured.twilio,
        reachable: twilio.ok,
        statusCode: twilio.status || null,
      },
      {
        id: 'datasets',
        name: 'Local datasets',
        client: 'SQLite',
        configured: true,
        reachable: datasets.ok,
        statusCode: datasets.status || null,
      },
    ],
  };
};

const runCommand = (command, args, cwd) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: 'pipe',
      env: { ...process.env, PATH: buildPathEnv() },
    });
    let output = '';

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(output || `Process exited with ${code}`));
      }
    });
  });
};

const checkDockerAvailability = () => {
  const dockerBin = getDockerCommand();
  const envWithPath = { ...process.env, PATH: buildPathEnv() };

  try {
    const versionResult = spawnSync(dockerBin, ['--version'], { encoding: 'utf8', env: envWithPath });
    if (versionResult.error) {
      return { available: false, detail: versionResult.error.message };
    }
    if (versionResult.status !== 0) {
      const detail = (versionResult.stderr || versionResult.stdout || '').trim();
      return { available: false, detail: detail || 'docker exited with a non-zero status.' };
    }

    const daemonProbe = spawnSync(dockerBin, ['info', '--format', '{{.ServerVersion}}'], {
      encoding: 'utf8',
      env: envWithPath,
    });
    if (daemonProbe.status !== 0) {
      const detail = (daemonProbe.stderr || daemonProbe.stdout || '').trim() || 'docker daemon is not reachable.';
      return { available: false, detail, binary: dockerBin };
    }

    return {
      available: true,
      detail: (daemonProbe.stdout || versionResult.stdout || '').trim(),
      binary: dockerBin,
    };
  } catch (error) {
    return { available: false, detail: error.message || 'Unable to run docker.' };
  }
};

const ensurePlatformRunning = async () => {
  const current = await checkPlatformAvailability();
  if (current.ready) {
    return { ready: true, started: false, message: current.message };
  }

  const dockerStatus = checkDockerAvailability();
  if (!dockerStatus.available) {
    return {
      ready: false,
      started: false,
      message: `Docker is not available: ${dockerStatus.detail}`,
    };
  }

  try {
    await runCommand('bash', ['scripts/start.sh'], platformRoot);
    await wait(15000);
    const refreshed = await checkPlatformAvailability();
    if (refreshed.ready) {
      return { ready: true, started: true, message: 'The platform stack was started successfully.' };
    }
    return { ready: false, started: true, message: refreshed.message };
  } catch (error) {
    return {
      ready: false,
      started: false,
      message: error.message || 'Unable to start the platform stack.',
    };
  }
};

ipcMain.handle('platform:check', async () => {
  return checkPlatformAvailability();
});

ipcMain.handle('platform:ensure', async () => {
  return ensurePlatformRunning();
});

ipcMain.handle('integrations:status', async () => {
  return checkIntegrations();
});

ipcMain.handle('integrations:save', async (_event, credentials) => {
  if (!existsSync(path.join(platformRoot, 'docker-compose.yml'))) {
    throw new Error('The platform repository could not be located.');
  }

  const current = await readIntegrationConfiguration();
  const updated = updateEnvContent(current, credentials);
  if (!updated.updatedKeys.length) {
    return {
      saved: false,
      restarted: false,
      message: 'No new credential values were provided.',
      status: await checkIntegrations(),
    };
  }

  const temporaryPath = `${envPath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, updated.content, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporaryPath, envPath);
  await fs.chmod(envPath, 0o600);

  const docker = checkDockerAvailability();
  if (!docker.available) {
    return {
      saved: true,
      restarted: false,
      updatedKeys: updated.updatedKeys,
      message: 'Credentials were saved. Restart the platform stack to apply them.',
      status: await checkIntegrations(),
    };
  }

  try {
    const services = [];
    if (updated.updatedKeys.includes('TWEEPY_BEARER_TOKEN')) {
      services.push('profile_search');
    }
    if (
      updated.updatedKeys.includes('TWILIO_ACCOUNT_SID')
      || updated.updatedKeys.includes('TWILIO_AUTH_TOKEN')
    ) {
      services.push('phone_search');
    }
    await runCommand(
      docker.binary,
      ['compose', 'up', '-d', '--force-recreate', ...services],
      platformRoot,
    );
    await wait(5000);
    return {
      saved: true,
      restarted: true,
      updatedKeys: updated.updatedKeys,
      message: 'Credentials were saved and the API services were restarted.',
      status: await checkIntegrations(),
    };
  } catch (error) {
    return {
      saved: true,
      restarted: false,
      updatedKeys: updated.updatedKeys,
      message: `Credentials were saved, but the services could not restart: ${error.message}`,
      status: await checkIntegrations(),
    };
  }
});

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#09111f',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      sandbox: false,
    },
  });

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  if (!app.isPackaged && process.env.WHOISIT_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools();
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

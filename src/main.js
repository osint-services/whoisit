import { app, BrowserWindow, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import started from 'electron-squirrel-startup';

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
      resolve({ ok: true, status: response.statusCode });
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
    'http://127.0.0.1:80/scan/health',
    'http://127.0.0.1:80/focus?url=https://example.com',
  ];

  for (const probeUrl of probeUrls) {
    const result = await probeEndpoint(probeUrl);
    if (result.ok) {
      return { ready: true, message: 'Platform services are reachable.' };
    }
  }

  return { ready: false, message: 'Platform services are not reachable yet.' };
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
    const result = spawnSync(dockerBin, ['--version'], { encoding: 'utf8', env: envWithPath });
    if (result.error) {
      return { available: false, detail: result.error.message };
    }
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || '').trim();
      return { available: false, detail: detail || 'docker exited with a non-zero status.' };
    }
    return { available: true, detail: (result.stdout || result.stderr || '').trim(), binary: dockerBin };
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

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 760,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      sandbox: false,
    },
  });

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
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

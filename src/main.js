import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import started from 'electron-squirrel-startup';

const {
  getConfiguredIntegrations,
  getPlatformRootCandidates,
  updateEnvContent,
} = require('./integrationConfig.cjs');

const {
  checkDocker,
  createDockerRunner,
  getPackagedPlatform,
  startPackagedPlatform,
} = require('./packagedPlatform.cjs');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const findPlatformRoot = () => {
  const candidates = getPlatformRootCandidates(app.getAppPath(), path);

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'docker-compose.yml')) && existsSync(path.join(candidate, 'scripts', 'start.sh'))) {
      return candidate;
    }
  }

  return path.resolve(app.getAppPath(), '..', '..', '..', '..', '..');
};

const packagedPlatform = app.isPackaged
  ? getPackagedPlatform(process.resourcesPath, app.getPath('userData'))
  : null;
const platformRoot = packagedPlatform?.root ?? findPlatformRoot();
const composePath = packagedPlatform?.composePath ?? path.join(platformRoot, 'docker-compose.yml');
const envPath = packagedPlatform?.envPath ?? path.join(platformRoot, '.env');
const runDocker = createDockerRunner();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const routes = ['/scan/healthz', '/phone_search/healthz', '/datasets/healthz', '/map/readyz'];
  if (packagedPlatform) routes.push('/focus/healthz');
  const results = await Promise.all(routes.map((route) => probeEndpoint(`http://127.0.0.1:80${route}`)));
  const unavailable = results.findIndex((result) => !result.ok);
  if (unavailable !== -1) {
    const { status } = results[unavailable];
    const detail = status ? `returned HTTP ${status}` : 'was unreachable';
    return { ready: false, message: `The platform endpoint ${routes[unavailable]} ${detail}.` };
  }
  return { ready: true, message: 'Platform services are ready.' };
};

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
  const [x, twilio, datasets, mapping] = await Promise.all([
    probeEndpoint('http://127.0.0.1:80/focus/readyz'),
    probeEndpoint('http://127.0.0.1:80/phone_search/healthz'),
    probeEndpoint('http://127.0.0.1:80/datasets/healthz'),
    probeEndpoint('http://127.0.0.1:80/map/readyz'),
  ]);
  return {
    platformRootAvailable: existsSync(composePath),
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
      {
        id: 'mapping',
        name: 'Social Mapping',
        client: 'GeoJSON / Leaflet',
        configured: true,
        reachable: mapping.ok,
        statusCode: mapping.status || null,
      },
    ],
  };
};

const ensurePlatformRunning = async () => {
  try {
    if (packagedPlatform) {
      await startPackagedPlatform(packagedPlatform, runDocker);
    } else {
      const current = await checkPlatformAvailability();
      if (current.ready) return current;
      if (!existsSync(composePath)) {
        return { ready: false, message: 'Start the local OSINT Services backend and retry.' };
      }
      await checkDocker(runDocker);
      await runDocker(['compose', 'up', '--build', '--detach'], { cwd: platformRoot, timeout: 15 * 60_000 });
    }

    const deadline = Date.now() + 60_000;
    let result = await checkPlatformAvailability();
    while (!result.ready && Date.now() < deadline) {
      await wait(1000);
      result = await checkPlatformAvailability();
    }
    return result;
  } catch (error) {
    return { ready: false, message: error.message || 'Unable to start the platform stack.' };
  }
};

// Serialize startup and configuration writes so Compose sees a complete settings file.
let platformOperation = Promise.resolve();
let pendingStartup;
const withPlatform = (operation) => {
  const result = platformOperation.then(operation);
  platformOperation = result.catch(() => {});
  return result;
};
const ensureOnce = () => {
  pendingStartup ??= withPlatform(ensurePlatformRunning).finally(() => { pendingStartup = undefined; });
  return pendingStartup;
};

ipcMain.handle('platform:check', async () => {
  return checkPlatformAvailability();
});

ipcMain.handle('platform:ensure', async () => {
  return ensureOnce();
});

ipcMain.handle('integrations:status', async () => {
  return checkIntegrations();
});

ipcMain.handle('integrations:save', (_event, credentials) => withPlatform(async () => {
  if (!existsSync(composePath)) {
    throw new Error('The platform Compose configuration could not be located.');
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

  if (packagedPlatform) {
    await fs.mkdir(packagedPlatform.settingsDir, { recursive: true, mode: 0o700 });
  }
  const temporaryPath = `${envPath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, updated.content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await fs.rename(temporaryPath, envPath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }

  try {
    if (packagedPlatform) {
      // Compose recreates the services whose environment changed.
      await startPackagedPlatform(packagedPlatform, runDocker);
    } else {
      await checkDocker(runDocker);
      const services = [];
      if (updated.updatedKeys.includes('TWEEPY_BEARER_TOKEN')) {
        services.push('profile_search', 'social_mapping');
      }
      if (updated.updatedKeys.some((key) => key.startsWith('TWILIO_'))) {
        services.push('phone_search');
      }
      await runDocker(['compose', 'up', '-d', '--force-recreate', ...services], { cwd: platformRoot });
    }
    return {
      saved: true,
      restarted: true,
      updatedKeys: updated.updatedKeys,
      message: 'Credentials were saved and the platform services were updated.',
      status: await checkIntegrations(),
    };
  } catch (error) {
    return {
      saved: true,
      restarted: false,
      updatedKeys: updated.updatedKeys,
      message: `Credentials were saved. ${error.message}`,
      status: await checkIntegrations(),
    };
  }
}));

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
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (URL.canParse(url) && ['https:', 'http:'].includes(new URL(url).protocol)) {
      void shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  if (!app.isPackaged && process.env.WHOISIT_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools();
  }
};

if (packagedPlatform && !app.requestSingleInstanceLock()) app.quit();

app.on('second-instance', () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
});

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

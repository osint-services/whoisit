const { execFile } = require('node:child_process');
const { existsSync, promises: fs } = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');

const exec = promisify(execFile);
const probeTimeout = 15_000;
const startupTimeout = 15 * 60_000;

function getPackagedPlatform(resourcesPath, userDataPath) {
  const root = path.join(resourcesPath, 'osint-platform');
  if (!existsSync(root)) return null;

  const settingsDir = path.join(userDataPath, 'platform');
  return {
    root,
    settingsDir,
    envPath: path.join(settingsDir, '.env'),
    composePath: path.join(root, 'compose.yaml'),
    archivePath: path.join(root, 'images.tar.gz'),
  };
}

function createDockerRunner() {
  const pathEntries = [
    ...(process.env.PATH || '').split(path.delimiter),
    '/usr/bin', '/usr/local/bin', '/snap/bin',
  ];
  const env = { ...process.env, PATH: [...new Set(pathEntries.filter(Boolean))].join(path.delimiter) };
  const binary = process.env.DOCKER_BIN || process.env.DOCKER || 'docker';
  return async (args, { cwd, timeout = probeTimeout } = {}) => {
    const { stdout } = await exec(binary, args, { cwd, env, timeout, maxBuffer: 1024 * 1024 });
    return stdout.trim();
  };
}

async function checkDocker(runDocker, { local = false } = {}) {
  try {
    await runDocker(['--version']);
  } catch {
    throw new Error('Install Docker and make the docker command available to Whoisit.');
  }

  try {
    const version = await runDocker(['compose', 'version', '--short']);
    if (!/^v?(2|5)\./.test(version)) throw new Error('Unsupported Compose major version');
  } catch {
    throw new Error('Install the Docker Compose v2 or v5 plugin.');
  }

  if (local) {
    const host = process.env.DOCKER_CONTEXT || !process.env.DOCKER_HOST
      ? await runDocker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])
      : process.env.DOCKER_HOST;
    if (!host.startsWith('unix://')) {
      throw new Error('Select a local Docker context using a Unix socket for the loopback gateway.');
    }
  }

  let engineVersion;
  try {
    engineVersion = await runDocker(['info', '--format', '{{.ServerVersion}}']);
  } catch {
    throw new Error('Start Docker and grant your desktop user access to its daemon, then retry.');
  }
  const engineMajor = /^v?(\d+)\./.exec(engineVersion)?.[1];
  if (!engineMajor || Number(engineMajor) < 28) {
    throw new Error('Docker Engine 28 or newer is required to keep the gateway local.');
  }
}

async function prepareSettings(layout) {
  await fs.mkdir(layout.settingsDir, { recursive: true, mode: 0o700 });
  const file = await fs.open(layout.envPath, 'a', 0o600);
  try {
    await file.chmod(0o600);
  } finally {
    await file.close();
  }
}

async function startPackagedPlatform(layout, runDocker) {
  const required = [layout.composePath, layout.archivePath, path.join(layout.root, 'nginx.conf')];
  if (!required.every((file) => existsSync(file))) {
    throw new Error('Some packaged platform files are missing. Reinstall the OSINT Services package.');
  }

  await checkDocker(runDocker, { local: true });
  await prepareSettings(layout);

  const composeArgs = [
    'compose', '--project-name', 'platform', '--project-directory', layout.root,
    '--env-file', layout.envPath, '--file', layout.composePath,
  ];
  const compose = (args, timeout) => runDocker([...composeArgs, ...args], { cwd: layout.root, timeout });
  let images;
  try {
    images = (await compose(['config', '--images'])).split(/\s+/).filter(Boolean);
    if (!images.length) throw new Error('No bundled images');
  } catch {
    throw new Error('Docker could not read the platform configuration. Check your settings file and retry.');
  }
  try {
    await runDocker(['image', 'inspect', '--format', '{{.Id}}', ...images]);
  } catch {
    try {
      await runDocker(['load', '--quiet', '--input', layout.archivePath], { timeout: startupTimeout });
    } catch {
      throw new Error('Docker could not load the bundled images. Check daemon access and free disk space, then retry.');
    }
  }
  try {
    await compose(['up', '--detach', '--no-build', '--pull', 'never'], startupTimeout);
  } catch (error) {
    if (/port is already allocated|address already in use/i.test(error.stderr || '')) {
      throw new Error('Port 80 on 127.0.0.1 is in use. Stop the conflicting service and retry.');
    }
    throw new Error('Docker could not start the platform. Check docker compose logs for the platform project, then retry.');
  }
}

module.exports = { checkDocker, createDockerRunner, getPackagedPlatform, prepareSettings, startPackagedPlatform };

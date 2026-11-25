const assert = require('node:assert/strict');
const { promises: fs } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { checkDocker, getPackagedPlatform, startPackagedPlatform } = require('../src/packagedPlatform.cjs');

test('Docker and Compose failures give distinct setup instructions', async () => {
  await assert.rejects(checkDocker(async () => { throw new Error('missing'); }), /Install Docker/);
  await assert.rejects(checkDocker(async () => '1.29.2'), /Compose v2 or v5 plugin/);
  await assert.rejects(checkDocker(async ([command]) => {
    if (command === 'info') throw new Error('permission denied');
    return '2.32.4';
  }), /grant your desktop user access/);
});

test('local platform accepts Compose v2 and v5 on Docker Engine 28 or newer', async () => {
  for (const composeVersion of ['v2.40.3', '5.6.0']) {
    const runDocker = async ([command]) => command === 'info' ? '28.0.0' : composeVersion;
    await checkDocker(runDocker);
  }
  await assert.rejects(checkDocker(async ([command]) => (
    command === 'info' ? '27.5.1' : '5.6.0'
  )), /Docker Engine 28 or newer/);
});

test('packaged startup loads absent images and preserves writable settings on repeat launch', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whoisit-test-'));
  const resources = path.join(root, 'resources');
  const userData = path.join(root, 'user data');
  assert.equal(getPackagedPlatform(resources, userData), null);
  await fs.mkdir(path.join(resources, 'osint-platform'), { recursive: true });
  const layout = getPackagedPlatform(resources, userData);
  t.after(async () => {
    await fs.chmod(layout.root, 0o755);
    await fs.rm(root, { recursive: true, force: true });
  });
  assert.equal(layout.envPath, path.join(userData, 'platform', '.env'));
  await assert.rejects(startPackagedPlatform(layout, () => assert.fail()), /packaged platform files are missing/);
  await Promise.all([
    layout.composePath, layout.archivePath, path.join(layout.root, 'nginx.conf'),
  ].map((file) => fs.writeFile(file, '')));
  await fs.chmod(layout.root, 0o555);

  const calls = [];
  let imagesLoaded = false;
  const runDocker = async (args) => {
    calls.push(args);
    if (args.includes('--short')) return 'v2.32.4';
    if (args[0] === 'info') return '29.1.3';
    if (args[0] === 'context') return 'unix:///var/run/docker.sock';
    if (args.includes('--images')) return 'osint-services/phone_search:1.2.0\nosint-services/proxy:1.2.0';
    if (args[0] === 'image' && !imagesLoaded) throw new Error('image missing');
    if (args[0] === 'load') imagesLoaded = true;
    return '';
  };

  await startPackagedPlatform(layout, runDocker);
  assert.equal((await fs.stat(layout.envPath)).mode & 0o777, 0o600);
  await fs.writeFile(layout.envPath, 'CERTIFICATE_INVENTORY_DOMAINS=example.test\n');
  await startPackagedPlatform(layout, runDocker);
  assert.equal(await fs.readFile(layout.envPath, 'utf8'), 'CERTIFICATE_INVENTORY_DOMAINS=example.test\n');
  assert.deepEqual(calls.filter(([command]) => command === 'load'), [
    ['load', '--quiet', '--input', layout.archivePath],
  ]);
  assert.deepEqual(calls.filter((args) => args.includes('up')), Array(2).fill([
    'compose', '--project-name', 'platform', '--project-directory', layout.root,
    '--env-file', layout.envPath, '--file', layout.composePath,
    'up', '--detach', '--no-build', '--pull', 'never',
  ]));
});

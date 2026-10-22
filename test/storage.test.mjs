import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('startup handles a mount that rejects chmod while keeping database files private and persistent', t => {
  const root = mkdtempSync(join(tmpdir(), 'hos-storage-chmod-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const code of ['EPERM', 'EACCES']) {
    const dataDir = join(root, code);
    mkdirSync(dataDir, { mode: 0o777 });
    chmodSync(dataDir, 0o777);
    const script = `
      import assert from 'node:assert/strict';
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const dataDir = ${JSON.stringify(dataDir)};
      const originalChmod = fs.chmodSync;
      fs.chmodSync = (path, mode) => {
        if (path === dataDir) throw Object.assign(new Error('Host controls mount permissions'), { code: ${JSON.stringify(code)} });
        return originalChmod(path, mode);
      };
      syncBuiltinESMExports();
      const { createApp } = await import('./server.mjs');
      const env = { ADMIN_PASSWORD: 'storage-test-only-password', NODE_ENV: 'production', SITE_URL: 'https://house-of-stone.example.test' };
      const first = createApp({ dataDir, env, backgroundNotifications: false });
      first.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('storage_regression', 'saved before restart');
      first.server.emit('close');
      const second = createApp({ dataDir, env, backgroundNotifications: false });
      assert.equal(second.db.prepare('SELECT value FROM settings WHERE key=?').get('storage_regression').value, 'saved before restart');
      assert.equal(fs.statSync(dataDir + '/house-of-stone.sqlite').mode & 0o777, 0o600);
      assert.equal(fs.statSync(dataDir + '/media').mode & 0o777, 0o700);
      assert.equal(fs.statSync(dataDir).mode & 0o777, 0o777);
      second.server.emit('close');
      console.log('Writable mounted storage started and persisted private data.');
    `;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8', timeout: 30000,
    });
    assert.match(output, /Writable mounted storage started/);
  }
});

test('root-owned mounted storage works without chmod access and preserves the existing database', {
  skip: process.platform !== 'linux' || process.getuid?.() !== 0,
}, t => {
  try {
    execFileSync(process.execPath, ['-e', 'process.exit(0)'], { uid: 65534, gid: 65534, stdio: 'pipe' });
  } catch (error) {
    if (error.code !== 'EINVAL') throw error;
    t.skip('This container maps only UID 0; the unprivileged-user check runs in GitHub CI.');
    return;
  }
  const root = mkdtempSync(join(tmpdir(), 'hos-mounted-storage-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = resolve(import.meta.dirname, '..');
  for (const path of ['server.mjs', 'catalog.mjs', 'founding-collection.mjs', 'content', 'public']) {
    cpSync(join(source, path), join(root, path), { recursive: true });
  }
  function makeReadable(path) {
    const directory = statSync(path).isDirectory();
    chmodSync(path, directory ? 0o755 : 0o644);
    if (directory) for (const entry of readdirSync(path)) makeReadable(join(path, entry));
  }
  makeReadable(root);
  mkdirSync(join(root, 'data'), { mode: 0o777 });
  chmodSync(join(root, 'data'), 0o777);
  mkdirSync(join(root, 'read-only-data'), { mode: 0o555 });
  const script = `
    import assert from 'node:assert/strict';
    import { chmodSync, statSync } from 'node:fs';
    import { createApp } from './server.mjs';
    const dataDir = ${JSON.stringify(join(root, 'data'))};
    const env = { ADMIN_PASSWORD: 'storage-test-only-password', NODE_ENV: 'production', SITE_URL: 'https://house-of-stone.example.test' };
    assert.throws(() => chmodSync(dataDir, 0o700), { code: 'EPERM' });
    const first = createApp({ dataDir, env, backgroundNotifications: false });
    first.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('storage_regression', 'saved before restart');
    const secret = first.db.prepare('SELECT value FROM settings WHERE key=?').get('hash_secret').value;
    const published = first.db.prepare('SELECT published FROM collection_state WHERE id=1').get().published;
    first.server.emit('close');
    const second = createApp({ dataDir, env, backgroundNotifications: false });
    assert.equal(second.db.prepare('SELECT value FROM settings WHERE key=?').get('storage_regression').value, 'saved before restart');
    assert.equal(second.db.prepare('SELECT value FROM settings WHERE key=?').get('hash_secret').value, secret);
    assert.equal(second.db.prepare('SELECT published FROM collection_state WHERE id=1').get().published, published);
    assert.equal(statSync(dataDir + '/house-of-stone.sqlite').mode & 0o777, 0o600);
    assert.equal(statSync(dataDir + '/media').mode & 0o777, 0o700);
    assert.equal(statSync(dataDir).mode & 0o777, 0o777);
    second.server.emit('close');
    assert.throws(() => createApp({ dataDir: ${JSON.stringify(join(root, 'read-only-data'))}, env }), /DATA_DIR is not writable/);
    console.log('Mounted storage supports startup, private files, persistence, and an actionable error when not writable.');
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: root, uid: 65534, gid: 65534, encoding: 'utf8', timeout: 30000,
  });
  assert.match(output, /Mounted storage supports startup/);
});

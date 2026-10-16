import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { verifiedRelease } from '../skills/ocr-kanban-setup/scripts/release.mjs';
const root = 'skills/ocr-kanban-setup';
test('published client signature matches release metadata and bootstrap has no missing local module', async () => {
  const release = verifiedRelease(JSON.parse(await readFile(join(root, 'assets/client-release.json'))), await readFile(join(root, 'assets/release-key.pem')));
  const metadata = JSON.parse(await readFile('RELEASE.json'));
  assert.equal(release.digest, metadata.releaseDigest); assert.equal(release.sequence, metadata.sequence);
  for (const name of await readdir(join(root, 'scripts'))) if (name.endsWith('.mjs') && name !== 'diagnose.mjs') {
    const code = await readFile(join(root, 'scripts', name), 'utf8');
    for (const match of code.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)) await stat(resolve(root, 'scripts', match[1]));
  }
  const { stdout } = await promisify(execFile)(process.execPath, [join(root, 'scripts/wizard.mjs'), '--check'], { timeout: 10000 });
  assert.equal(JSON.parse(stdout).bundleVerified, true);
});
test('checksum inventory matches distribution and the ZIP contains the same installer instructions and signed assets', async () => {
  for (const line of (await readFile('SHA256SUMS', 'utf8')).trim().split(/\r?\n/)) {
    const [expected, path] = line.split('  '); assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), expected, path);
  }
  const zip = await readFile('dist/ocr-kanban-setup.zip'), entries = new Map(); let pos = 0;
  while (zip.readUInt32LE(pos) === 0x04034b50) {
    assert.equal(zip.readUInt16LE(pos + 8), 0); const length = zip.readUInt32LE(pos + 18), n = zip.readUInt16LE(pos + 26), extra = zip.readUInt16LE(pos + 28);
    const name = zip.subarray(pos + 30, pos + 30 + n).toString(), start = pos + 30 + n + extra; entries.set(name, zip.subarray(start, start + length)); pos = start + length;
  }
  for (const path of ['SKILL.md', 'assets/client-release.json', 'assets/release-key.pem']) assert.deepEqual(entries.get('ocr-kanban-setup/' + path), await readFile(join(root, path)));
});
test('agent instructions ask for the file path and let the installer place the key; Mac support remains explicitly provisional', async () => {
  const guide = await readFile('INSTALL_FOR_AGENTS.md', 'utf8'), agent = await readFile('AGENTS.md', 'utf8');
  assert(guide.includes('запроси путь сам')); assert(agent.includes('Сам запроси у пользователя путь')); assert(guide.includes('client.json')); assert(guide.includes('Исходный файл не удаляй'));
  const metadata = JSON.parse(await readFile('RELEASE.json')); assert.equal(metadata.verification.macOSLiveDeliveryVerified, false);
  const example = JSON.parse(await readFile('connection.example.json')); assert.equal(example.token, 'REPLACE_WITH_ROLE_KEY_FROM_KANBAN_ADMIN');
});

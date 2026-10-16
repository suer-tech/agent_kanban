// Repackages existing signed client and setup instructions. It cannot create adapter signatures.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { zipFiles } from '../skills/ocr-kanban-setup/scripts/zip.mjs';
import { verifiedRelease } from '../skills/ocr-kanban-setup/scripts/release.mjs';
const root = 'skills/ocr-kanban-setup', files = {};
const release = verifiedRelease(JSON.parse(await readFile(join(root, 'assets/client-release.json'))), await readFile(join(root, 'assets/release-key.pem')));
const gather = async dir => { for (const entry of await readdir(dir, { withFileTypes: true })) {
  if (entry.isSymbolicLink()) throw Error('Installer must not contain symlinks');
  const path = join(dir, entry.name);
  if (entry.isDirectory()) await gather(path); else files['ocr-kanban-setup/' + path.slice(root.length + 1).replaceAll('\\', '/')] = await readFile(path);
} };
await gather(root); await mkdir('dist', { recursive: true }); await writeFile('dist/ocr-kanban-setup.zip', zipFiles(files));
const paths = ['dist/ocr-kanban-setup.zip', join(root, 'assets/client-release.json'), join(root, 'assets/release-key.pem')];
await writeFile('SHA256SUMS', (await Promise.all(paths.map(async path => createHash('sha256').update(await readFile(path)).digest('hex') + '  ' + path.replaceAll('\\', '/')))).join('\n') + '\n');
console.log(JSON.stringify({ packed: true, clientVersion: release.version, sequence: release.sequence, files: Object.keys(files).length }));

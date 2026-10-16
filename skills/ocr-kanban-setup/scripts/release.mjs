import { verify, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, rename, lstat } from 'node:fs/promises';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';

export const UPDATE_URL = 'https://ocr-agent-kanban.vercel.app/client-updates/latest.json';
const allowed = /^(bridge\/[\w./-]+\.(mjs|json)|skills\/ocr-kanban\/[\w./-]+\.(mjs|md|yaml)|vscode-companion\/(package.json|extension.cjs)|installer\/[\w.-]+\.(mjs|pem)|package.json)$/;
export function verifiedRelease(envelope, publicKey, minSequence = 0) {
  const { payload, signature } = envelope ?? {};
  if (!payload || !verify(null, Buffer.from(JSON.stringify(payload)), publicKey, Buffer.from(signature ?? '', 'base64'))) throw Error('Invalid release signature');
  if (!Number.isSafeInteger(payload.sequence) || payload.sequence < minSequence || !/^[\w.-]{1,80}$/.test(payload.version)) throw Error('Invalid or obsolete release');
  if (payload.protocol !== 'codex-peer-2026-10-v1') throw Error('Unknown release protocol');
  const files = Object.entries(payload.files ?? {}); let total = 0;
  if (!files.length || files.length > 200) throw Error('Invalid release file count');
  for (const [path, data] of files) {
    if (!allowed.test(path) || path.split('/').some(p => !p || p === '.' || p === '..') || typeof data !== 'string') throw Error('Invalid release path');
    total += Buffer.byteLength(data, 'base64');
  }
  if (total > 5 * 1024 * 1024 || !payload.files['bridge/worker.mjs'] || !payload.files['installer/supervisor.mjs'] || !payload.files['skills/ocr-kanban/SKILL.md']) throw Error('Invalid release contents');
  return { ...payload, digest: createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
}
export async function saveJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = path + '.' + process.pid + '.' + crypto.randomUUID() + '.tmp';
  await writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 }); await rename(tmp, path);
}
export async function assertPrivateTree(path, root) {
  const rel = relative(resolve(root), resolve(path));
  if (rel.startsWith('..') || isAbsolute(rel)) throw Error('Path outside installation');
  let current = resolve(root);
  for (const part of ['', ...rel.split(/[\\/]/).filter(Boolean)]) {
    if (part) current = join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw Error('Symlinks are not allowed in installation paths'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}
export async function materialize(root, release) {
  const path = join(root, 'releases', release.digest);
  await assertPrivateTree(path, root);
  try { const done = JSON.parse(await readFile(join(path, 'release.json'))); if (done.digest === release.digest) return path; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  await mkdir(path, { recursive: true, mode: 0o700 });
  for (const [name, data] of Object.entries(release.files)) {
    const target = join(path, name); await assertPrivateTree(target, root); await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, Buffer.from(data, 'base64'), { mode: 0o600 });
  }
  await saveJson(join(path, 'release.json'), { version: release.version, sequence: release.sequence, digest: release.digest });
  return path;
}
export async function downloadRelease(publicKey, minSequence, fetcher = fetch) {
  const r = await fetcher(UPDATE_URL, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw Error(`Update service HTTP ${r.status}`);
  let size = 0, parts = [];
  for await (const part of r.body) { size += part.length; if (size > 8 * 1024 * 1024) throw Error('Release too large'); parts.push(part); }
  return verifiedRelease(JSON.parse(Buffer.concat(parts)), publicKey, minSequence);
}

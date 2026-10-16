import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { mkdir, readFile, writeFile, copyFile, realpath, access, chmod, unlink } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { verifiedRelease, materialize, saveJson, assertPrivateTree } from './release.mjs';
import { installSkill, codeCommand, installCompanion } from './components.mjs';
import { enableAutostart } from './autostart.mjs';
const run = promisify(execFile);
export function defaultRoot(platform = process.platform, home = homedir()) {
  return platform === 'darwin' ? join(home, 'Library/Application Support/OCR Kanban') : join(process.env.LOCALAPPDATA ?? join(home, 'AppData/Local'), 'OCR Kanban');
}
export async function install({ connection, project, transport = 'vscode', preferredTransport = transport === 'auto' ? 'vscode' : transport, root = defaultRoot(), home = homedir(), envelope, publicKey, autostart = true, start = true }, hooks = {}) {
  if (!['win32', 'darwin'].includes(process.platform) || Number(process.versions.node.split('.')[0]) !== 24) throw Error('Windows/macOS with Node.js 24 required');
  if (!['desktop', 'vscode', 'auto'].includes(transport) || !['desktop', 'vscode'].includes(preferredTransport)) throw Error('Invalid client selection');
  if (connection.url !== 'https://ocr-agent-kanban.vercel.app' || typeof connection.token !== 'string' || connection.token.length < 24) throw Error('A personal service connection is required');
  const response = await (hooks.fetcher ?? fetch)(connection.url + '/api/me', { headers: { authorization: 'Bearer ' + connection.token }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error('Service rejected the personal key');
  const { actor } = await response.json(); if (!['document-agent', 'ocr-agent'].includes(actor)) throw Error('Use a personal participant key, not an administrator key');
  project = await realpath(project); root = resolve(root);
  await assertPrivateTree(root, dirname(root));
  const skillRoot = join(home, '.agents/skills/ocr-kanban');
  // Don't install a duplicate with the same name over an existing legacy skill.
  try { await access(join(home, '.codex/skills/ocr-kanban/SKILL.md')); throw Error('Existing legacy ocr-kanban skill: explicit migration required before installation'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  let old; try { old = JSON.parse(await readFile(join(root, 'installation.json'))); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (old && (old.actor !== actor || old.project !== project || old.transport !== transport)) throw Error('Existing installation has another role, project or client; preserve it and reconfigure explicitly');
  let current; try { current = JSON.parse(await readFile(join(root, 'current.json'))); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const release = verifiedRelease(envelope, publicKey, current?.sequence ?? old?.sequence ?? 0);
  if (current?.sequence === release.sequence && current.digest !== release.digest) throw Error('Release sequence collision');
  let branch;
  if (actor === 'ocr-agent') {
    const git = hooks.git ?? (async args => (await run('git', args, { cwd: project, windowsHide: true, timeout: 30000 })).stdout.trim());
    const remote = (await git(['remote', 'get-url', 'origin'])).replace(/\.git$/, '').replace(/\/$/, '').toLowerCase();
    if (remote !== 'https://github.com/suer-tech/ocr_document_reader') throw Error('Executor must use suer-tech/OCR_document_reader');
    branch = await git(['branch', '--show-current']); if (!branch) throw Error('Executor checkout needs a branch');
  }
  let projectRef; try { projectRef = JSON.parse(await readFile(join(project, '.ocr-kanban.json'))); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (projectRef?.configPath && resolve(projectRef.configPath) !== join(root, 'client.json')) throw Error('Project already uses another kanban connection');
  const code = transport === 'desktop' ? undefined : await (hooks.findCode ?? codeCommand)({ home });
  const bridgeId = old?.bridgeId ?? connection.bridgeId ?? `${actor}-${crypto.randomUUID()}`;
  if (!/^[\w-]{1,100}$/.test(bridgeId)) throw Error('Invalid bridge identifier');
  await mkdir(root, { recursive: true, mode: 0o700 });
  for (const dir of ['runtime', 'state', 'logs', '.runtime']) await mkdir(join(root, dir), { recursive: true, mode: 0o700 });
  const node = join(root, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node');
  // Bootstrap pins a private Node runtime; no changes to the system Node or PATH.
  if (!old) await copyFile(process.execPath, node); await chmod(node, 0o700);
  const path = await materialize(root, release);
  const installation = { root, home, project, actor, bridgeId, transport, preferredTransport, skillRoot, code, node, branch, sequence: release.sequence, installedAt: old?.installedAt ?? new Date().toISOString() };
  await saveJson(join(root, 'installation.json'), installation);
  const dataDir = join(project, '.ocr-kanban-data'); await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await saveJson(join(root, 'client.json'), { url: connection.url, token: connection.token, bridgeId, bridgeFiles: true, dataDir });
  await saveJson(join(project, '.ocr-kanban.json'), { configPath: join(root, 'client.json') });
  // Local Git exclusions only; no repository source or shared .gitignore changes.
  try {
    const excludePath = (await run('git', ['rev-parse', '--git-path', 'info/exclude'], { cwd: project, windowsHide: true, timeout: 10000 })).stdout.trim();
    const exclude = resolve(project, excludePath); await mkdir(dirname(exclude), { recursive: true });
    let body = await readFile(exclude, 'utf8').catch(e => { if (e.code !== 'ENOENT') throw e; return ''; });
    for (const line of ['/.ocr-kanban.json', '/.ocr-kanban-data/']) if (!body.split(/\r?\n/).includes(line)) body += '\n' + line + '\n';
    await writeFile(exclude, body);
  } catch (e) { if (actor === 'ocr-agent') throw e; }
  await installSkill(path, installation);
  if (transport !== 'desktop') await (hooks.installCompanion ?? installCompanion)(path, installation);
  await copyFile(join(path, 'installer/launcher.mjs'), join(root, 'launcher.mjs')); await writeFile(join(root, 'release-key.pem'), publicKey, { mode: 0o600 });
  await saveJson(join(root, 'current.json'), { path, version: release.version, sequence: release.sequence, digest: release.digest });
  if (autostart) { await unlink(join(root, 'state/disabled')).catch(e => { if (e.code !== 'ENOENT') throw e; }); await (hooks.enableAutostart ?? enableAutostart)({ home, root, node }); }
  await saveJson(join(root, 'status.json'), { state: 'installed_pending_client_check', platform: process.platform, at: new Date().toISOString() });
  if (start && (process.platform !== 'darwin' || !autostart)) {
    const child = spawn(node, [join(root, 'launcher.mjs'), root], { detached: true, windowsHide: true, stdio: 'ignore' });
    await new Promise((r, j) => { child.once('spawn', r); child.once('error', j); }); child.unref();
  }
  return { installed: true, actor, root, project, transport, autostart, version: release.version, compatibility: 'pending_client_check' };
}

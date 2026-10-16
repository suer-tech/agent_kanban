import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { zipFiles } from './zip.mjs';
import { assertPrivateTree, saveJson } from './release.mjs';
const run = promisify(execFile);
export async function installSkill(release, installation) {
  const root = installation.skillRoot, source = join(release, 'skills/ocr-kanban');
  await assertPrivateTree(root, dirname(root));
  try { const marker = JSON.parse(await readFile(join(root, '.ocr-kanban-managed.json'))); if (marker.owner !== installation.root) throw Error('Skill is managed by another installation'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; try { await readFile(join(root, 'SKILL.md')); throw Error('An existing unmanaged ocr-kanban skill must be migrated explicitly'); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  const copy = async (from, to) => {
    await assertPrivateTree(to, dirname(root)); await mkdir(to, { recursive: true, mode: 0o700 });
    for (const item of await readdir(from, { withFileTypes: true })) { if (item.isSymbolicLink()) throw Error('Unexpected skill symlink'); if (item.isDirectory()) await copy(join(from, item.name), join(to, item.name)); else await copyFile(join(from, item.name), join(to, item.name)); }
  };
  await copy(source, root);
  const body = await readFile(join(root, 'SKILL.md'), 'utf8');
  const node = installation.node.replaceAll('\\', '/'), skill = root.replaceAll('\\', '/');
  const command = process.platform === 'win32' ? `& '${node.replaceAll("'", "''")}' '${skill.replaceAll("'", "''")}/scripts/kanban.mjs'` : `'${node.replaceAll("'", "'\\''")}' '${skill.replaceAll("'", "'\\''")}/scripts/kanban.mjs'`;
  await writeFile(join(root, 'SKILL.md'), body.replaceAll('node <skill>/scripts/kanban.mjs', command), { mode: 0o600 });
  await saveJson(join(root, '.ocr-kanban-managed.json'), { owner: installation.root });
}
export async function companionVsix(release, output) {
  const source = join(release, 'vscode-companion'), pkg = JSON.parse(await readFile(join(source, 'package.json')));
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>',
    'extension.vsixmanifest': `<?xml version="1.0" encoding="utf-8"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="en-US" Id="${pkg.name}" Version="${pkg.version}" Publisher="${pkg.publisher}"/><DisplayName>${pkg.displayName}</DisplayName><Description xml:space="preserve">${pkg.description}</Description><Categories>Other</Categories><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${pkg.engines.vscode}"/><Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="openai.chatgpt"/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>`,
    'extension/package.json': await readFile(join(source, 'package.json')),
    'extension/extension.cjs': await readFile(join(source, 'extension.cjs'))
  };
  await writeFile(output, zipFiles(files)); return output;
}
export async function codeCommand({ platform = process.platform, home, localAppData = process.env.LOCALAPPDATA, exists = async path => { await readFile(path); } }) {
  const candidates = platform === 'darwin' ? ['/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code', join(home, 'Applications/Visual Studio Code.app/Contents/Resources/app/bin/code')] : [join(localAppData ?? join(home, 'AppData/Local'), 'Programs/Microsoft VS Code/bin/code.cmd'), join(process.env.ProgramFiles ?? 'C:/Program Files', 'Microsoft VS Code/bin/code.cmd')];
  for (const path of candidates) { try { await exists(path); return path; } catch {} }
  throw Error('Install Visual Studio Code first');
}
export async function installCompanion(release, installation, { execute = run } = {}) {
  const vsix = await companionVsix(release, join(installation.root, 'state/ocr-kanban-companion.vsix'));
  const code = installation.code;
  if (process.platform === 'win32') {
    // Recent VS Code updates put resources inside a commit folder. Read its official launcher,
    // then invoke the exact executable with an argument array instead of cmd.exe.
    const launcher = await readFile(code, 'utf8'), match = launcher.match(/"%~dp0\.\.\\([^"\r\n]*resources\\app\\out\\cli\.js)"/i);
    if (!match || match[1].split(/[\\/]/).some(p => p === '..' || p === '.') || !/^[\w.\\/-]+$/.test(match[1])) throw Error('Unknown VS Code CLI layout');
    const cli = join(dirname(code), '..', match[1]);
    await execute(join(dirname(code), '../Code.exe'), [cli, '--install-extension', vsix, '--force'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', VSCODE_DEV: '' }, timeout: 120000, windowsHide: true, maxBuffer: 1000000 });
  } else await execute(code, ['--install-extension', vsix, '--force'], { timeout: 120000, maxBuffer: 1000000 });
}

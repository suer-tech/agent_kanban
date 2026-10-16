import { join } from 'node:path';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
export const LABEL = 'com.suer.ocr-kanban';
const xml = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const vbs = s => '"' + s.replaceAll('"', '""') + '"';
export function autostartSpec({ platform = process.platform, home, root, node, appData = process.env.APPDATA }) {
  const args = [node, join(root, 'launcher.mjs'), root];
  if (platform === 'darwin') {
    const path = join(home, 'Library/LaunchAgents', LABEL + '.plist');
    const content = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${LABEL}</string><key>ProgramArguments</key><array>${args.map(a => `<string>${xml(a)}</string>`).join('')}</array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>30</integer><key>WorkingDirectory</key><string>${xml(root)}</string><key>StandardOutPath</key><string>${xml(join(root, 'logs/service.log'))}</string><key>StandardErrorPath</key><string>${xml(join(root, 'logs/service-error.log'))}</string><key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict></dict></plist>\n`;
    return { path, content };
  }
  if (platform === 'win32' && appData) {
    const path = join(appData, 'Microsoft/Windows/Start Menu/Programs/Startup/OCR Kanban.vbs');
    const command = args.map(s => '"' + s + '"').join(' ');
    return { path, content: `Set w = CreateObject("WScript.Shell")\r\nw.Run ${vbs(command)}, 0, False\r\n` };
  }
  throw Error('Autostart supports Windows and macOS');
}
export async function enableAutostart(options) {
  const spec = autostartSpec(options); await mkdir(join(options.root, 'logs'), { recursive: true });
  // Refuse to replace an unrelated login job with the same name.
  try { const old = await readFile(spec.path, 'utf8'); if (!old.includes(options.root) && !old.includes(xml(options.root))) throw Error('An unrelated startup entry already exists'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  await mkdir((await import('node:path')).dirname(spec.path), { recursive: true }); await writeFile(spec.path, spec.content, { mode: 0o600 });
  if ((options.platform ?? process.platform) === 'darwin') {
    const domain = `gui/${process.getuid()}`;
    await run('/bin/launchctl', ['bootout', domain + '/' + LABEL]).catch(() => {});
    await run('/bin/launchctl', ['bootstrap', domain, spec.path]);
  }
  return spec.path;
}
export async function disableAutostart(options) {
  const spec = autostartSpec(options);
  if ((options.platform ?? process.platform) === 'darwin') await run('/bin/launchctl', ['bootout', `gui/${process.getuid()}/${LABEL}`]).catch(() => {});
  try { const old = await readFile(spec.path, 'utf8'); if (!old.includes(options.root) && !old.includes(xml(options.root))) throw Error('Startup entry is not owned by this installation'); await rm(spec.path); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}

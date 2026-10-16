import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { install } from './install-core.mjs';
import { verifiedRelease } from './release.mjs';
const args = process.argv.slice(2), flag = name => { const i = args.indexOf('--' + name); return i < 0 ? undefined : args[i + 1]; };
const base = resolve(flag('bundle') ?? join(fileURLToPath(new URL('.', import.meta.url)), '../assets'));
const cli = createInterface({ input: process.stdin, output: process.stdout });
try {
  if (args.includes('--check')) {
    const release = verifiedRelease(JSON.parse(await readFile(join(base, 'client-release.json'))), await readFile(join(base, 'release-key.pem')));
    console.log(JSON.stringify({ bundleVerified: true, version: release.version, platform: process.platform, architecture: process.arch, node: process.versions.node, installationChanged: false })); cli.close(); process.exit(0);
  }
  console.log('OCR Kanban — установка навыка, моста, помощника и автозапуска. Ключи не выводятся.');
  const connectionPath = flag('connection') ?? await cli.question('Путь к личному connection.json, полученному от администратора: ');
  const project = flag('project') ?? await cli.question('Путь к папке вашего проекта: ');
  const transport = flag('transport') ?? (await cli.question('Клиент: vscode / desktop / auto [vscode]: ') || 'vscode');
  const preferredTransport = transport === 'auto' ? flag('preferred') ?? (await cli.question('Предпочитаемый клиент: vscode / desktop [vscode]: ') || 'vscode') : transport;
  const envelope = JSON.parse(await readFile(join(base, 'client-release.json'))), publicKey = await readFile(join(base, 'release-key.pem'));
  const result = await install({ connection: JSON.parse(await readFile(resolve(connectionPath.trim()))), project: project.trim(), transport: transport.trim(), preferredTransport, envelope, publicKey, ...(flag('root') ? { root: resolve(flag('root')) } : {}) });
  console.log(JSON.stringify(result, null, 2));
  console.log('Откройте Codex/VS Code. Диагностика: status.json в папке установки. macOS ожидает подтверждённый профиль адаптера; без него доставка не запускается.');
} catch (e) { console.error('Установка не завершена: ' + e.message); process.exitCode = 1; }
finally { cli.close(); }

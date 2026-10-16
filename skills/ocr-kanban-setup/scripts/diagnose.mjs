import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.argv[2] ?? (process.platform === 'darwin' ? join(homedir(), 'Library/Application Support/OCR Kanban') : join(process.env.LOCALAPPDATA, 'OCR Kanban'));
const { path } = JSON.parse(await readFile(join(root, 'current.json'))); process.argv[2] = root;
await import(pathToFileURL(join(path, 'installer/diagnose.mjs')).href);

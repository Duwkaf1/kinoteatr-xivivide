import { spawnSync } from 'node:child_process';
import { readFile, readdir, stat, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const application = path.join(root, 'artifacts', 'Yoru-win32-x64');
await access(path.join(application, 'Yoru.exe'));
await access(path.join(application, 'resources', 'app.asar'));
const prefix = process.platform === 'win32' ? '/' : '-';
const candidates = [process.env.MAKENSIS, 'makensis',
  process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'NSIS', 'makensis.exe'),
  process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'NSIS', 'makensis.exe')].filter(Boolean);
const compiler = candidates.find(candidate => spawnSync(candidate, [`${prefix}VERSION`], { encoding: 'utf8' }).status === 0);
if (!compiler) throw new Error('Нужен бесплатный NSIS 3: Windows — choco install nsis; Linux — пакет nsis. Можно указать путь через MAKENSIS.');

const files = []; const directories = []; let bytes = 0;
async function inventory(directory, relative = '') {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) { directories.push(name); await inventory(path.join(directory, entry.name), name); }
    else if (entry.isFile()) { files.push(name); bytes += (await stat(path.join(directory, entry.name))).size; }
    else throw new Error(`Unsupported packaged entry: ${name}`);
  }
}
await inventory(application);
// Remove only files shipped by this build; keep any files the user added to the folder.
const nsisPath = value => value.replaceAll('$', '$$').replaceAll('"', '$\\"').replaceAll('/', '\\');
const inventoryPath = path.join(root, 'artifacts', 'uninstall-files.nsh');
await writeFile(inventoryPath, [
  '; Generated from the packaged app. Never recursively delete the installation directory.',
  ...files.map(file => `Delete "$INSTDIR\\${nsisPath(file)}"`),
  ...directories.sort((a, b) => b.split(path.sep).length - a.split(path.sep).length).map(dir => `RMDir "$INSTDIR\\${nsisPath(dir)}"`),
].join('\n') + '\n');
const output = path.join(root, 'artifacts', `Yoru-Setup-${version}-x64.exe`);
const definitions = { VERSION: version, APP_DIR: application, OUTPUT: output,
  ICON: path.join(root, 'assets', 'yoru.ico'), UNINSTALL_FILES: inventoryPath, SIZE_KB: Math.ceil(bytes / 1024) };
// NSIS defaults to the Windows ANSI codepage for scripts without a BOM.
// Explicit UTF-8 also preserves Cyrillic filenames in the generated inventory.
const args = [`${prefix}V3`, `${prefix}INPUTCHARSET`, 'UTF8', ...Object.entries(definitions).map(([key, value]) => `${prefix}D${key}=${value}`), path.join(root, 'installer', 'yoru.nsi')];
const result = spawnSync(compiler, args, { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`NSIS exited with ${result.status}`);
const binary = await readFile(output);
if (binary.subarray(0, 2).toString() !== 'MZ') throw new Error('Installer is not a Windows executable');
const digest = createHash('sha256').update(binary).digest('hex');
await writeFile(`${output}.sha256`, `${digest}  ${path.basename(output)}\n`);
console.log(`Installer: ${output}\nSize: ${(binary.length / 1048576).toFixed(1)} MiB\nSHA256: ${digest}`);
if (process.env.CI === 'true') console.log(`::notice title=Yoru installer::${path.basename(output)} | ${binary.length} bytes | SHA256 ${digest}`);

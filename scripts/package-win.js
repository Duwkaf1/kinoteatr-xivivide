import { packager } from '@electron/packager';
import path from 'node:path';
import { readFile, copyFile, writeFile } from 'node:fs/promises';
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const output = await packager({
  dir: '.', out: 'artifacts', name: 'Kadr', executableName: 'Kadr', platform: 'win32', arch: 'x64',
  electronVersion: '45.0.0', appVersion: version, asar: true, overwrite: true,
  download: { cacheRoot: path.resolve('.cache/electron') },
  ignore: [/^\/(test|e2e|test-results|playwright-report|scripts|docs|artifacts|\.git|\.cache)(\/|$)/, /^\/(vite\.config|playwright\.config)/],
});
for (const item of output) {
  await copyFile('node_modules/hls.js/LICENSE', path.join(item, 'LICENSE-hls.js.txt'));
  await copyFile('docs/playlist.example.json', path.join(item, 'playlist.example.json'));
  await writeFile(path.join(item, 'ПРОЧИТАЙ.txt'), `\uFEFFКАДР ${version} — ранняя версия\n\nРаспакуй всю папку и запусти Kadr.exe на Windows 10/11 x64. Для запуска нужны все файлы папки, а не только EXE. Сборка не подписана; реальный запуск и звук Discord на Windows ещё не проверены.\n\nВ этой версии: новая тема, блок продолжения просмотра, сортировка, Кинозал, горячие клавиши и отключаемые анимации. HLS загружается по необходимости, карточки выводятся порциями, прогресс хранится отдельно от библиотеки.\n\nF — полный экран, M — звук, пробел — пауза, стрелки — 10 секунд, Escape — выход из Кинозала. В полях ввода клавиши работают как обычно.\n\nСейчас работают прямые HTTPS-видеоссылки и импорт списков серий. Каталоги и автоматическое управление плеерами сайтов TroutCDN/Brogiro пока не подключены: доступны кнопки открытия отдельных страниц. В playlist.example.json ссылки .invalid нужно заменить своими. Язык задаётся в данных источника, автоматического распознавания языка звука нет.\n\nДля Discord выбери нужное окно приложения и включи передачу звука. При полном отказе сети или всех источников непрерывное воспроизведение невозможно.\n`, 'utf8');
  console.log(`Windows application: ${item}`);
}

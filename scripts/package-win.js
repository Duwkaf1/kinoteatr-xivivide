import { packager } from '@electron/packager';
import path from 'node:path';
import { readFile, copyFile, writeFile } from 'node:fs/promises';
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const output = await packager({
  dir: '.', out: 'artifacts', name: 'Yoru', executableName: 'Yoru', platform: 'win32', arch: 'x64',
  electronVersion: '45.0.0', appVersion: version, asar: true, overwrite: true,
  download: { cacheRoot: path.resolve('.cache/electron') },
  ignore: [/^\/(test|e2e|test-results|playwright-report|scripts|docs|artifacts|\.git|\.cache)(\/|$)/, /^\/(vite\.config|playwright\.config)/],
});
for (const item of output) {
  await copyFile('node_modules/hls.js/LICENSE', path.join(item, 'LICENSE-hls.js.txt'));
  await copyFile('docs/playlist.example.json', path.join(item, 'playlist.example.json'));
  await writeFile(path.join(item, 'ПРОЧИТАЙ.txt'), `\uFEFFYORU ${version} — ранняя версия\n\nРаспакуй всю папку и запусти Yoru.exe на Windows 10/11 x64. Для запуска нужны все файлы папки, а не только EXE. Сборка не подписана. Версия 0.2 проверялась автоматически на Windows; текущую сборку проверили в Electron на Linux. Звук Discord на Windows ещё не проверен.\n\nВ разделе «Настройки» доступны четыре готовые темы и «Своя»: цвета фона, панелей, текста и акцента, скругление 12–36 px. Своя палитра сохраняется при переключении тем. Режимы Качество/Баланс/Экономия задают разрешение по умолчанию, HLS-буфер и декорации интерфейса. Режим «Вручную» и раздел «Подробная настройка приложения» позволяют выбрать свой буфер, число попыток и ожидание, студии, громкость, скорость, перемотку, размер текста и компактность. Разрешение можно изменить отдельно. В экономном режиме отключены эффекты и уменьшена порция карточек. Изменение режима не прерывает текущую серию: буфер и разрешение применяются к следующему запуску видео.\n\nВ настройках можно отключить анимации и автоматическую следующую серию. Данные хранятся на этом устройстве.\n\nF — полный экран, M — звук, пробел — пауза, стрелки — настроенный шаг (по умолчанию 10 секунд), Escape — выход из Кинозала. В полях ввода клавиши работают как обычно.\n\nДля обложки при добавлении аниме нажми «Выбрать», найди название в AniLibria и выбери правильный сезон. У существующей карточки нажми «Обложка». Можно вставить свою HTTPS-ссылку или убрать постер. Постер не меняет видео и озвучку.\n\nСейчас работают прямые HTTPS-видеоссылки и импорт списков серий. Каталоги и автоматическое управление плеерами сайтов TroutCDN/Brogiro пока не подключены: доступны кнопки открытия отдельных страниц. В playlist.example.json ссылки .invalid нужно заменить своими. Язык задаётся в данных источника, автоматического распознавания языка звука нет.\n\nДля Discord выбери нужное окно приложения и включи передачу звука. При полном отказе сети или всех источников непрерывное воспроизведение невозможно.\n`, 'utf8');
  console.log(`Windows application: ${item}`);
}

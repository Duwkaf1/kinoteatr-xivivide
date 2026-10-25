import { packager } from '@electron/packager';
import path from 'node:path';
import { readFile, copyFile, writeFile, readdir, rm } from 'node:fs/promises';
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const output = await packager({
  dir: '.', out: 'artifacts', name: 'Yoru', executableName: 'Yoru', platform: 'win32', arch: 'x64',
  electronVersion: '45.0.0', appVersion: version, asar: true, overwrite: true,
  icon: path.resolve('assets/yoru.ico'),
  win32metadata: { CompanyName: 'Duwkaf1', FileDescription: 'Yoru — личный кинозал для аниме', ProductName: 'Yoru' },
  download: { cacheRoot: path.resolve('.cache/electron') },
  ignore: [/^\/(test|e2e|test-results|playwright-report|scripts|installer|docs|public|artifacts|\.git|\.cache)(\/|$)/, /^\/assets\/branding(\/|$)/, /^\/(vite\.config|playwright\.config)/],
});
for (const item of output) {
  await copyFile('public/fonts/OFL-Nunito.txt', path.join(item, 'LICENSE-Nunito.txt'));
  // The app explicitly uses Russian; keep English as Chromium's fallback.
  // Remove only other UI locale packs, never codecs, fonts or rendering files.
  const locales = path.join(item, 'locales');
  for (const file of await readdir(locales, { withFileTypes: true })) {
    if (file.isFile() && file.name.endsWith('.pak') && !['ru.pak', 'en-US.pak'].includes(file.name)) await rm(path.join(locales, file.name));
  }
  await copyFile('node_modules/hls.js/LICENSE', path.join(item, 'LICENSE-hls.js.txt'));
  await copyFile('docs/playlist.example.json', path.join(item, 'playlist.example.json'));
  await copyFile('docs/playlist-original.example.json', path.join(item, 'playlist-original.example.json'));
  await copyFile('docs/viewing-0.6.md', path.join(item, 'Просмотр-и-субтитры.md'));
  await copyFile('docs/redesign-0.7.md', path.join(item, 'Оформление-и-проверки.md'));
  await copyFile('docs/character-details.md', path.join(item, 'Имена-и-заметки.md'));
  await copyFile('docs/release-audit-0.7.2.md', path.join(item, 'Проверка-перед-публикацией.md'));
  await copyFile('node_modules/video.js/LICENSE', path.join(item, 'LICENSE-video.js.txt'));
  await copyFile('node_modules/libass-wasm/dist/js/COPYRIGHT', path.join(item, 'LICENSE-libass-wasm.txt'));
  await writeFile(path.join(item, 'ПРОЧИТАЙ.txt'), `\uFEFFYORU ${version} — ранняя версия\n\nУстановщик Yoru-Setup ставит приложение одним файлом на Windows 10/11 x64. Если скачал ZIP без установки, распакуй всю папку и запусти Yoru.exe: для такого запуска нужны все файлы папки. Сборка не подписана. Текущую сборку проверили в Electron на Linux. Результат автоматической Windows-проверки смотри в GitHub Actions. Звук Discord на Windows ещё не проверен.\n\nВ разделе «Настройки» есть две вкладки: «Основные» и «Дополнительно». Ползунок «Производительность / Баланс / Качество» управляет оформлением, количеством карточек и расходом памяти при загрузке видео. Выбранная чёткость и текущая серия не меняются. Производительность отключает анимации, тени, декоративный блок главной и увеличение обложек. Качество включает объёмные обложки и мягкие переходы с учётом системного уменьшения движения. Доступны пять тем, включая OLED, и «Своя». Форму кнопок можно увидеть в примере рядом с ползунком, без значений в пикселях. Своя палитра сохраняется при переключении тем. Подробные параметры загрузки, восстановления, звука и плееров находятся во вкладке «Дополнительно». Интерфейс использует локальный шрифт Nunito, который работает без интернета.\n\nВ настройках можно отключить анимации и автоматическую следующую серию. Данные хранятся на этом устройстве.\n\nF — полный экран, M — звук, пробел — пауза, стрелки — настроенный шаг (по умолчанию 10 секунд), Escape — выход из Кинозала. В полях ввода клавиши работают как обычно.\n\nДля обложки при добавлении аниме нажми «Выбрать», найди название в AniLibria и выбери правильный сезон. У существующей карточки нажми «Обложка». Можно вставить свою HTTPS-ссылку или убрать постер. Постер не меняет видео и озвучку.\n\nСейчас работают прямые HTTPS-видеоссылки и импорт списков серий. Каталоги и автоматическое управление плеерами сайтов TroutCDN/Brogiro пока не подключены: доступны кнопки открытия отдельных страниц. В playlist.example.json ссылки .invalid нужно заменить своими. Язык задаётся в данных источника, автоматического распознавания языка звука нет.\n\nЕсть режим оригинальной озвучки с автоматическим выбором японского оригинала и переводов субтитров. Шестерёнка «Параметры просмотра» → «Добавить источник или перевод» добавляет варианты разных студий из файлов/ссылок SRT, VTT, ASS, SSA. Основной и альтернативный плееры сохраняют позицию, паузу и звук при смене. Страница Yummyani/AnimeJoy открывается отдельно; её сериями и переводами управляет сайт.\n\nПанель AniDB связывает ID каждого сезона, импортирует XML и показывает персонажей/сэйю. Для API нужен зарегистрированный клиент. Фотографии персонажей и сэйю загружаются из полей изображений AniDB. Кнопка на фото позволяет выбрать замену через MyAnimeList/Jikan или свою HTTPS-ссылку; выбор сохраняется после обновления состава. Для старых составов повторно импортируй XML или обнови данные, чтобы получить фотографии. Карандаш рядом с именем меняет личную подпись; под именем есть заметка с автосохранением. Они относятся к этому аниме и персонажу, хранятся отдельно от кэша и сохраняются при обновлении состава. Состав каждой серии автоматически не подтверждён; ручные отметки подписываются отдельно. См. «Просмотр-и-субтитры.md» и playlist-original.example.json.\n\nДля Discord выбери нужное окно приложения и включи передачу звука. При полном отказе сети или всех источников непрерывное воспроизведение невозможно.\n`, 'utf8');
  console.log(`Windows application: ${item}`);
}

import { createCharacterSearch, validateCharacterPhoto } from './character-photos.js';

export function characterPhotoPicker({ $, node, save }) {
  const search = createCharacterSearch(); let target; let selected; let controller; let serial = 0;
  function cancel() { serial++; controller?.abort(); $('#character-photo-find').disabled = false; }
  function picture(url) {
    const image = node('img'); image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer'; image.src = url; return image;
  }
  function preview() {
    const host = $('#character-photo-preview'); host.replaceChildren();
    const value = $('#character-photo-url').value.trim(); const photo = value ? validateCharacterPhoto({ ...selected, url: value }) : null;
    if (!photo) { host.append(node('p', value ? 'Нужна HTTPS-ссылка на изображение.' : 'Будет использована исходная фотография AniDB, если она доступна.', 'muted')); return; }
    const image = picture(photo.url); image.onerror = () => { if (host.contains(image)) host.replaceChildren(node('p', 'Фотография не загрузилась. Попробуй другой снимок или ссылку.', 'muted')); };
    const caption = node('div'); caption.append(node('strong', selected?.name || target?.name || 'Фотография персонажа'), node('p', `Источник: ${photo.source}`, 'muted')); host.append(image, caption);
  }
  function open(character, releaseId) {
    cancel(); target = { ...character, releaseId }; selected = character.photo;
    $('#character-photo-name').textContent = character.name;
    $('#character-photo-query').value = character.name.slice(0, 100);
    $('#character-photo-url').value = character.photo?.url || '';
    $('#character-photo-results').replaceChildren(); $('#character-photo-error').textContent = '';
    $('#character-photo-status').textContent = 'Найди персонажа по имени и выбери правильную фотографию. Можно попробовать имя на английском.';
    preview(); $('#character-photo-dialog').showModal();
  }
  $('#character-photo-query').oninput = () => { cancel(); $('#character-photo-results').replaceChildren(); $('#character-photo-status').textContent = 'Нажми «Найти», чтобы посмотреть фотографии.'; };
  $('#character-photo-query').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); $('#character-photo-find').click(); } };
  $('#character-photo-find').onclick = async () => {
    cancel(); const token = serial; controller = new AbortController(); $('#character-photo-find').disabled = true;
    $('#character-photo-results').replaceChildren(); $('#character-photo-status').textContent = 'Ищем фотографии…';
    try {
      const results = await search($('#character-photo-query').value, { signal: controller.signal });
      if (token !== serial || !$('#character-photo-dialog').open) return;
      $('#character-photo-status').textContent = results.length ? 'Выбери нужного персонажа. Поиск не заменяет фотографию автоматически.' : 'Не нашли. Попробуй другое имя или вставь свою ссылку.';
      for (const result of results) {
        const button = node('button', undefined, 'character-photo-result'); button.type = 'button'; button.setAttribute('aria-label', `Выбрать фотографию: ${result.name}`); button.setAttribute('aria-pressed', 'false');
        const image = picture(result.url); image.onerror = () => image.remove(); const caption = node('span');
        caption.append(node('strong', result.name), node('small', result.japanese || 'MyAnimeList'));
        button.append(image, caption);
        button.onclick = () => {
          selected = result; $('#character-photo-url').value = result.url; $('#character-photo-error').textContent = ''; preview();
          for (const item of $('#character-photo-results').children) item.setAttribute('aria-pressed', String(item === button));
        };
        $('#character-photo-results').append(button);
      }
    } catch (error) { if (token === serial) $('#character-photo-status').textContent = error.name === 'TimeoutError' ? 'Каталог не ответил. Повтори поиск позже или вставь свою ссылку.' : error.message === 'Failed to fetch' ? 'Нет связи с каталогом. Можно вставить свою ссылку на фотографию.' : error.message; }
    finally { if (token === serial) $('#character-photo-find').disabled = false; }
  };
  $('#character-photo-url').oninput = () => { selected = null; $('#character-photo-error').textContent = ''; };
  $('#character-photo-url').onchange = preview;
  $('#character-photo-cancel').onclick = () => $('#character-photo-dialog').close();
  $('#character-photo-reset').onclick = () => { selected = null; $('#character-photo-url').value = ''; preview(); };
  $('#character-photo-dialog').addEventListener('close', () => { cancel(); $('#character-photo-preview').replaceChildren(); });
  $('#character-photo-form').onsubmit = event => {
    event.preventDefault(); const value = $('#character-photo-url').value.trim();
    const photo = value ? validateCharacterPhoto({ ...selected, url: value }) : null;
    if (value && !photo) { $('#character-photo-error').textContent = 'Нужна HTTPS-ссылка без логина и пароля, до 2048 символов.'; return; }
    try { save(target.releaseId, target.id, photo); $('#character-photo-dialog').close(); }
    catch (error) { $('#character-photo-error').textContent = error.message; }
  };
  return { open };
}

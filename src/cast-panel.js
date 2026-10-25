import { parseAniDB, readCastCache, saveCastCache, castForEpisode, anidbPage, anidbReleaseId, characterRole } from './anidb.js';
import { mergeCastPhotos, validateCharacterPhoto } from './character-photos.js';
import { characterPhotoPicker } from './character-photo-picker.js';
import { icon } from './icons.js';
import { characterDetailsEditor } from './character-details-editor.js';
export function castPanel({ $, node, active, persist, toast }) {
  let cache = readCastCache(); let serial = 0;
  const details = characterDetailsEditor({ $, node, changed: () => render() });
  const photos = characterPhotoPicker({ $, node, save: (releaseId, characterId, photo) => {
    const data = cache[releaseId]; const character = data?.characters.find(item => item.id === characterId);
    if (!character) throw new Error('Данные персонажа изменились. Открой выбор фотографии заново.');
    if (photo) character.photo = validateCharacterPhoto(photo); else delete character.photo;
    const saved = save(data); render(); toast(saved ? 'Фотография персонажа сохранена.' : 'Фотография изменена только до закрытия приложения: не удалось сохранить её.');
  } });
  const season = () => Number($('#cast-season').value) || 1;
  const mapping = () => active()?.title.seasons?.find(item => item.number === season());
  const id = () => mapping()?.anidbId || (season() === 1 ? active()?.title.anidbId : null);
  const message = text => { $('#cast-status').textContent = text; $('#cast-settings-status').textContent = text; };
  $('#open-cast-settings').onclick = () => { $('#cast-settings-status').textContent = ''; $('#cast-settings-dialog').showModal(); };
  for (const selector of ['#close-cast-settings', '#done-cast-settings']) $(selector).onclick = () => $('#cast-settings-dialog').close();
  function save(data) { cache[data.id] = data; try { saveCastCache(cache); return true; } catch { toast('Каст показан до закрытия приложения: не удалось сохранить его на диске.'); return false; } }
  function render() {
    details.flush();
    serial++; const value = active(); if (!value) return;
    $('#cast-context').textContent = `${value.title.title} · ${$('#cast-season').selectedOptions[0]?.textContent || 'Сезон 1'}`;
    $('#cast-settings-context').textContent = $('#cast-context').textContent;
    $('#cast-season-label').hidden = $('#cast-season').options.length < 2;
    $('#anidb-id').value = id() ? anidbPage(id()) : ''; $('#cast-list').replaceChildren(); $('#cast-episode-editor').replaceChildren();
    const data = cache[id()]; const known = data && Array.isArray(data.characters) && Array.isArray(data.episodes);
    const episode = known ? data.episodes.find(item => item.number === String(value.episode.number)) : null;
    $('#anidb-episode').disabled = !episode?.id || season() !== (value.episode.season || 1);
    $('#save-episode-cast').disabled = !known || season() !== (value.episode.season || 1);
    $('#cast-settings-label').textContent = known ? 'Настроить' : 'Добавить персонажей';
    $('#cast-episode-settings').hidden = !known;
    if (!known) { $('#cast-status').textContent = 'Персонажей пока нет. Список можно добавить в настройках.'; return; }
    const perEpisode = $('#cast-scope').value === 'episode';
    const characters = perEpisode ? castForEpisode(data, value.episode.number) : data.characters;
    $('#cast-status').textContent = perEpisode ? characters === null ? 'Для этой серии данные ещё не отмечены.' : `Серия ${value.episode.number} · отмечено вручную: ${characters.length}` : `Персонажей: ${characters.length} · имена и заметки можно менять`;
    for (const character of [...(characters || [])].sort((a, b) => characterRole(a.role).rank - characterRole(b.role).rank)) {
      const personal = details.attach(character, { titleId: value.title.id, releaseId: data.id, characterId: character.id });
      const card = node('article', undefined, 'cast-card'); const role = characterRole(character.role).label;
      card.dataset.characterId = character.id;
      const portrait = node('div', undefined, 'character-portrait'); const fallback = node('span', undefined, 'character-photo-fallback'); fallback.append(icon('portrait'), node('span', 'Фотографии пока нет')); portrait.append(fallback);
      const source = character.photo?.url || character.imageUrl;
      if (source) {
        const image = node('img', undefined, 'character-photo'); image.alt = personal.name; image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
        image.onload = () => { fallback.hidden = true; }; image.onerror = () => { image.remove(); fallback.lastElementChild.textContent = 'Фото недоступно'; };
        image.src = source; portrait.append(image);
      }
      const edit = node('button', undefined, 'character-photo-edit icon-button'); edit.type = 'button'; edit.append(icon('image')); edit.setAttribute('aria-label', `Выбрать фото: ${personal.name}`); edit.title = 'Выбрать фотографию'; edit.onclick = () => photos.open(character, data.id); portrait.append(edit);
      const body = node('div', undefined, 'character-body'); body.append(personal.heading, personal.note, node('p', role || 'Персонаж', 'character-role'));
      const actors = node('div', undefined, 'character-actors');
      for (const actor of character.actors) {
        const row = node('div', undefined, 'character-actor');
        if (actor.imageUrl) { const image = node('img'); image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer'; image.onerror = () => image.remove(); image.src = actor.imageUrl; row.append(image); }
        row.append(node('span', actor.name)); actors.append(row);
      }
      if (!character.actors.length) actors.append(node('span', 'Актёр озвучивания не указан', 'muted'));
      body.append(actors);
      card.append(portrait, body);
      $('#cast-list').append(card);
    }
    const marked = data.manualEpisodes?.[String(value.episode.number)] || [];
    for (const character of data.characters) {
      const label = node('label'); const input = node('input'); input.type = 'checkbox'; input.value = character.id; input.checked = marked.includes(character.id);
      const name = details.name(character, { titleId: value.title.id, releaseId: data.id, characterId: character.id });
      label.append(input, node('span', name)); $('#cast-episode-editor').append(label);
    }
  }
  function episodeChanged() {
    const value = active(); if (!value) return;
    const numbers = [...new Set([1, ...value.title.episodes.map(ep => ep.season || 1), ...(value.title.seasons || []).map(item => item.number)])].sort((a, b) => a - b);
    $('#cast-season').replaceChildren(...numbers.map(number => { const option = node('option', value.title.seasons?.find(s => s.number === number)?.title || `Сезон ${number}`); option.value = number; return option; }));
    $('#cast-season').value = value.episode.season || 1; render();
  }
  $('#cast-season').onchange = () => { if (season() !== (active()?.episode.season || 1)) $('#cast-scope').value = 'season'; render(); }; $('#cast-scope').onchange = () => {
    if ($('#cast-scope').value === 'episode') $('#cast-season').value = active()?.episode.season || 1;
    render();
  };
  $('#bind-anidb').onclick = () => {
    try {
      const value = active(); const entry = { ...(mapping() || {}), number: season(), anidbId: anidbReleaseId($('#anidb-id').value) };
      value.title.seasons = [...(value.title.seasons || []).filter(item => item.number !== season()), entry].sort((a, b) => a.number - b.number);
      const saved = persist(); render(); $('#cast-settings-status').textContent = saved ? 'Страница сохранена. Если список ещё пуст, выбери способ загрузки ниже.' : 'Ссылка применена только до закрытия приложения: не удалось сохранить её.';
    } catch (error) { $('#cast-settings-status').textContent = error.message; }
  };
  async function open(episode = false) {
    try {
      const value = active(); const data = cache[id()]; const episodeId = episode ? data?.episodes.find(item => item.number === String(value.episode.number))?.id : undefined;
      if (!id()) throw new Error('Сначала сохрани ссылку на аниме.');
      if (window.kadr?.openAniDB) await window.kadr.openAniDB({ id: id(), episodeId });
      else window.open(anidbPage(id(), episodeId), '_blank', 'noopener,noreferrer');
    } catch (error) { message(error.message); }
  }
  $('#anidb-open').onclick = () => open(); $('#anidb-episode').onclick = () => open(true);
  $('#anidb-xml-button').onclick = () => $('#anidb-xml').click();
  $('#anidb-xml').onchange = async event => {
    const target = id(); const token = serial; const file = event.target.files[0];
    try {
      if (!target) throw new Error('Сначала сохрани ссылку на аниме.');
      if (!file || file.size > 2 * 1024 * 1024) throw new Error('Нужен XML-файл до 2 МиБ.');
      const data = parseAniDB(await file.text(), target);
      if (token !== serial) return;
      const saved = save(mergeCastPhotos(data, cache[target])); render(); $('#cast-settings-status').textContent = saved ? 'Персонажи добавлены. Можно закрыть настройки.' : 'Персонажи добавлены только до закрытия приложения: не удалось сохранить их.';
    } catch (error) { if (token === serial) message(error.message); }
    event.target.value = '';
  };
  $('#anidb-fetch').onclick = async () => {
    const target = id(); const token = serial; const button = $('#anidb-fetch'); button.disabled = true;
    try {
      if (!target) throw new Error('Сначала сохрани ссылку на аниме.');
      if (!window.kadr?.fetchAniDB) throw new Error('Прямой запрос AniDB доступен в настольном приложении. Здесь можно импортировать XML.');
      const client = $('#anidb-client').value.trim(); const version = Number($('#anidb-client-version').value);
      if (!client) throw new Error('Для API нужно зарегистрированное имя клиента AniDB. Укажи его ниже или импортируй XML.');
      const xml = await window.kadr.fetchAniDB({ id: target, client, version });
      if (token !== serial) return;
      const data = parseAniDB(xml, target); const saved = save(mergeCastPhotos(data, cache[target])); render(); $('#cast-settings-status').textContent = saved ? 'Список обновлён.' : 'Список обновлён только до закрытия приложения: не удалось сохранить его.';
    } catch (error) { if (token === serial) message(`Не удалось обновить: ${error.message}`); }
    finally { button.disabled = false; }
  };
  $('#save-episode-cast').onclick = () => {
    const data = cache[id()]; if (!data || season() !== (active()?.episode.season || 1)) return;
    data.manualEpisodes ||= {}; data.manualEpisodes[String(active().episode.number)] = [...$('#cast-episode-editor').querySelectorAll('input:checked')].map(input => Number(input.value));
    data.updatedAt = Date.now(); save(data); $('#cast-scope').value = 'episode'; render();
  };
  const config = (() => { try { const value = JSON.parse(localStorage.getItem('yoru.anidb.client') || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; } })();
  $('#anidb-client').value = typeof config.client === 'string' ? config.client.slice(0, 32) : ''; $('#anidb-client-version').value = Number.isInteger(config.version) && config.version > 0 ? config.version : 1;
  for (const input of [$('#anidb-client'), $('#anidb-client-version')]) input.onchange = () => {
    if (!input.checkValidity()) return;
    try { localStorage.setItem('yoru.anidb.client', JSON.stringify({ client: $('#anidb-client').value.trim(), version: Number($('#anidb-client-version').value) })); } catch { toast('Не удалось сохранить параметры AniDB.'); }
  };
  return { episodeChanged };
}

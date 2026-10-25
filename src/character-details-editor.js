import { createCharacterDetailsStore, CHARACTER_NAME_LIMIT, CHARACTER_NOTE_LIMIT } from './character-details.js';
import { icon } from './icons.js';

export function characterDetailsEditor({ $, node, changed }) {
  const store = createCharacterDetailsStore(); const drafts = new Map(); let target;
  const key = context => JSON.stringify(context);
  function commit(id) {
    const draft = drafts.get(id); if (!draft) return;
    clearTimeout(draft.timer);
    try { store.set(draft.context, { note: draft.value }); draft.status.textContent = 'Сохранено'; drafts.delete(id); }
    catch (error) { draft.status.textContent = error.message; }
  }
  function flush() { for (const id of [...drafts.keys()]) commit(id); }
  function open(character, context) {
    target = { character, context };
    $('#character-name-source').textContent = `Имя в AniDB: ${character.name}`;
    $('#character-name-input').value = store.get(context).name || character.name;
    $('#character-name-error').textContent = '';
    $('#character-name-dialog').showModal();
    $('#character-name-input').select();
  }
  $('#character-name-input').maxLength = CHARACTER_NAME_LIMIT;
  $('#character-name-reset').onclick = () => { $('#character-name-input').value = target.character.name; $('#character-name-error').textContent = ''; };
  $('#character-name-cancel').onclick = () => $('#character-name-dialog').close();
  $('#character-name-form').onsubmit = event => {
    event.preventDefault(); const name = $('#character-name-input').value.trim();
    if (!name) { $('#character-name-error').textContent = 'Укажи имя или нажми «Исходное имя».'; return; }
    try {
      store.set(target.context, { name: name === target.character.name ? '' : name });
      $('#character-name-dialog').close(); changed();
    } catch (error) { $('#character-name-error').textContent = error.message; }
  };
  window.addEventListener('beforeunload', flush); window.addEventListener('pagehide', flush);
  return {
    flush,
    name(character, context) { return store.get(context).name || character.name; },
    attach(character, context) {
      const personal = store.get(context); const name = personal.name || character.name;
      const heading = node('div', undefined, 'character-heading'); const title = node('h3', name); title.title = `Имя в AniDB: ${character.name}`;
      const edit = node('button', undefined, 'character-name-edit icon-button'); edit.type = 'button'; edit.append(icon('edit')); edit.title = 'Изменить имя'; edit.setAttribute('aria-label', `Изменить имя: ${name}`); edit.onclick = () => open(character, context); heading.append(title, edit);
      const host = node('div', undefined, 'character-note-field'); const note = node('textarea', undefined, 'character-note');
      const id = key(context); const draft = drafts.get(id); const status = node('span', store.error ? 'Не удалось прочитать сохранённые подписи.' : '', 'character-note-status'); status.setAttribute('role', 'status');
      note.rows = 1; note.maxLength = CHARACTER_NOTE_LIMIT; note.placeholder = 'Добавить заметку…'; note.setAttribute('aria-label', `Заметка к персонажу: ${name}`); note.value = draft?.value ?? personal.note ?? '';
      if (draft) draft.status = status;
      note.oninput = () => {
        clearTimeout(drafts.get(id)?.timer); status.textContent = 'Сохраняем…';
        drafts.set(id, { context, value: note.value, status, timer: setTimeout(() => commit(id), 400) });
      };
      note.onblur = () => commit(id);
      host.append(note, status); return { name, heading, note: host };
    },
  };
}

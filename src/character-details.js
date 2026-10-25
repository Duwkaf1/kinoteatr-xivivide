const KEY = 'yoru.character-details.v1';
export const CHARACTER_NAME_LIMIT = 160;
export const CHARACTER_NOTE_LIMIT = 500;

function contextKey({ titleId, releaseId, characterId }) {
  if (typeof titleId !== 'string' || !titleId || !Number.isSafeInteger(releaseId) || releaseId < 1 || !Number.isSafeInteger(characterId) || characterId < 1) throw new Error('Не удалось определить аниме и персонажа.');
  return JSON.stringify([titleId, releaseId, characterId]);
}
function details(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Некорректные личные подписи персонажа.');
  const result = {};
  for (const [field, limit] of [['name', CHARACTER_NAME_LIMIT], ['note', CHARACTER_NOTE_LIMIT]]) {
    if (value[field] === undefined) continue;
    if (typeof value[field] !== 'string' || value[field].length > limit) throw new Error(`${field === 'name' ? 'Имя' : 'Заметка'} — до ${limit} символов.`);
    const text = value[field].replace(/\r\n?/g, '\n').trim();
    if (text) result[field] = text;
  }
  return result;
}

// Personal writing is kept outside the replaceable, bounded AniDB metadata cache.
export function createCharacterDetailsStore(storage = localStorage) {
  let entries = new Map(); let readError = false;
  try {
    const raw = JSON.parse(storage.getItem(KEY) || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid store');
    for (const [key, value] of Object.entries(raw)) {
      const ids = JSON.parse(key);
      if (!Array.isArray(ids) || ids.length !== 3 || contextKey({ titleId: ids[0], releaseId: ids[1], characterId: ids[2] }) !== key) throw new Error('Invalid identity');
      entries.set(key, details(value));
    }
  } catch { readError = true; entries = new Map(); }
  return {
    get(context) { return { ...entries.get(contextKey(context)) }; },
    set(context, patch) {
      if (readError) throw new Error('Не удалось прочитать личные подписи. Старые данные не перезаписаны.');
      const key = contextKey(context); const value = details({ ...entries.get(key), ...patch }); const next = new Map(entries);
      if (Object.keys(value).length) next.set(key, value); else next.delete(key);
      try { storage.setItem(KEY, JSON.stringify(Object.fromEntries(next))); }
      catch { throw new Error('Не удалось сохранить подпись на устройстве. Текст пока остаётся в поле.'); }
      entries = next; return { ...value };
    },
    get error() { return readError; },
  };
}

import { CATALOG_HOSTS, catalogRequestURL } from '../src/catalog-provider.js';
import { boundedText } from '../src/subtitles.js';

// The renderer supplies a typed operation, never a destination URL. Only these
// two official public API origins are reachable through this bridge.
export async function requestCatalog(data, { fetcher = globalThis.fetch, signal } = {}) {
  catalogRequestURL(data);
  const deadline = AbortSignal.timeout(12000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let failure;
  for (const origin of CATALOG_HOSTS) {
    combined.throwIfAborted();
    try {
      const response = await fetcher(catalogRequestURL(data, origin), { credentials: 'omit', redirect: 'error', signal: combined, headers: { Accept: 'application/json' } });
      if (response.status === 429) throw new Error('Каталог просит подождать. Повтори поиск немного позже.');
      if (response.status === 404) throw new Error('Это аниме больше не найдено в каталоге.');
      const body = await boundedText(response, 2 * 1024 * 1024);
      return JSON.parse(body);
    } catch (error) {
      if (combined.aborted) throw error;
      failure = error;
      if (/просит подождать|больше не найдено/.test(error.message)) break;
    }
  }
  throw new Error(/просит подождать|больше не найдено/.test(failure?.message) ? failure.message : 'Каталог сейчас не отвечает. Проверь соединение и попробуй ещё раз.');
}

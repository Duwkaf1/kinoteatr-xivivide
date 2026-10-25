import { defineConfig } from 'vite';
import { requestCatalog } from './desktop/catalog-network.js';
// Same typed gateway as Electron, for local development and browser QA. The
// production desktop app uses its isolated IPC bridge rather than this server.
function catalogGateway() {
  const middleware = (server) => { server.middlewares.use('/__yoru/catalog', async (request, response) => {
    if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
    const url = new URL(request.url, 'http://localhost'); const args = Object.fromEntries(url.searchParams);
    if (args.page !== undefined) args.page = Number(args.page);
    if (args.releaseId !== undefined) args.releaseId = Number(args.releaseId);
    const controller = new AbortController(); response.on('close', () => { if (!response.writableEnded) controller.abort(); });
    try {
      const result = await requestCatalog(args, { signal: controller.signal });
      if (!response.destroyed) { response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(result)); }
    } catch (error) {
      if (!response.destroyed) { response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify({ error: error.message })); }
    }
  }); };
  return { name: 'yoru-catalog-gateway', configureServer: middleware, configurePreviewServer: middleware };
}
export default defineConfig({ base: './', plugins: [catalogGateway()], server: { host: '127.0.0.1', port: 5173, strictPort: true } });

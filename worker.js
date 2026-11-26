// Cloudflare Worker: GitHub Pages -> Worker -> Apps Script Web App.
// Variables (Settings > Variables and Secrets):
//   GAS_EXEC_URL       (secret)  URL /exec de la implementación de Apps Script.
//   ALLOWED_ORIGIN     origen exacto del sitio, p. ej. https://usuario.github.io
//                      (varios separados por coma, p. ej. para pruebas con http://localhost:8080).
//   GAS_SHARED_SECRET  (secret, recomendado) mismo valor que WORKER_SECRET en Apps Script
//                      (se genera ejecutando generarSecretoWorker()).
const MAX_BODY_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 28000;

const cors = origin => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin'
});
const baseHeaders = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };

function json(obj, status, origin) {
  return Response.json(obj, { status, headers: { ...baseHeaders, ...cors(origin) } });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
    if (!origin || !allowed.includes(origin)) return new Response('Origin no autorizado', { status: 403, headers: baseHeaders });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...baseHeaders, ...cors(origin) } });
    if (request.method !== 'POST') return json({ exito: false, error: 'Método no permitido.' }, 405, origin);
    if (!env.GAS_EXEC_URL) return json({ exito: false, error: 'El Worker no tiene configurada GAS_EXEC_URL.' }, 500, origin);

    let payload;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) return json({ exito: false, error: 'Solicitud demasiado grande.' }, 413, origin);
      payload = JSON.parse(text);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('forma inválida');
    } catch (_) {
      return json({ exito: false, error: 'JSON inválido.' }, 400, origin);
    }

    // El secreto lo pone SIEMPRE el Worker; cualquier valor enviado por el cliente se descarta.
    delete payload.secret;
    if (env.GAS_SHARED_SECRET) payload.secret = env.GAS_SHARED_SECRET;

    try {
      const upstream = await fetch(env.GAS_EXEC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
      });
      const text = await upstream.text();
      let data;
      try { data = JSON.parse(text); }
      catch (_) { throw new Error('Apps Script no devolvió JSON. Verifica la implementación /exec, su acceso y que sea la versión más reciente.'); }
      return json(data, 200, origin);
    } catch (err) {
      const timeout = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
      return json({ exito: false, error: timeout ? 'Apps Script tardó demasiado en responder. Inténtalo de nuevo.' : (err.message || 'No fue posible contactar Apps Script.') }, 502, origin);
    }
  }
};

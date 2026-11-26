/* ============================================================
   CAPA HTTP: GitHub Pages -> Cloudflare Worker -> Apps Script
   ============================================================ */
const API_URL = window.BITACORA_CONFIG && window.BITACORA_CONFIG.API_URL;
const API_TIMEOUT_MS = 60000;

// Cada acción del frontend -> acción del servidor + campos del cuerpo.
const API_MAP = {
  login:             (a) => ({accion:'login', usuario:a[0], password:a[1]}),
  logout:            (a) => ({accion:'logout', token:a[0]}),
  apiBootstrap:      (a) => ({accion:'bootstrap', token:a[0]}),
  apiRegister:       (a) => ({accion:'registrarAtencion', token:a[0], data:a[1]}),
  apiCompare:        (a) => ({accion:'compararBase', token:a[0], query:a[1], type:a[2]}),
  apiAlerts:         (a) => ({accion:'alertas', token:a[0]}),
  apiResolveAlert:   (a) => ({accion:'resolverAlerta', token:a[0], id:a[1]}),
  apiAddTramite:     (a) => ({accion:'agregarTramite', token:a[0], name:a[1]}),
  apiCreateUser:     (a) => ({accion:'crearUsuario', token:a[0], data:a[1]}),
  buscarPersonas:    (a) => ({accion:'buscarPersonas', token:a[0], query:a[1], type:a[2]}),
  obtenerExpediente: (a) => ({accion:'obtenerExpediente', token:a[0], personId:a[1]})
};

async function server(action, ...args) {
  if (!API_URL || API_URL.includes('TU-WORKER')) {
    throw new Error('Configura la URL de Cloudflare Worker en js/config.js.');
  }
  const build = API_MAP[action];
  if (!build) throw new Error('Acción de frontend no mapeada: ' + action);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(build(args)),
      signal: ctrl.signal
    });
  } catch (err) {
    throw new Error(err.name === 'AbortError'
      ? 'El servidor tardó demasiado en responder. Inténtalo de nuevo.'
      : 'No se pudo conectar con el servidor. Revisa tu conexión.');
  } finally {
    clearTimeout(timer);
  }

  let result;
  try { result = await response.json(); }
  catch (_) { throw new Error('Respuesta inválida del servidor (HTTP ' + response.status + ').'); }
  if (!result.exito) {
    const e = new Error(result.error || 'El servidor rechazó la operación.');
    e.code = result.codigo || '';
    throw e;
  }
  return result.data;
}

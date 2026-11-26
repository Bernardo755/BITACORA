/* ============================================================
   CAPA HTTP: GitHub Pages -> Apps Script (/exec)
   Se envía como text/plain para evitar el preflight CORS, que Apps Script
   no soporta. No agregues cabeceras personalizadas.
   ============================================================ */
const API_URL = window.BITACORA_CONFIG && window.BITACORA_CONFIG.API_URL;
const API_TIMEOUT_MS = 60000;

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
  if (!window.BITACORA_CONFIG) {
    throw new Error('No se cargó js/config.js. Verifica que exista en la carpeta js/ y recarga con Ctrl+F5.');
  }
  if (!API_URL || API_URL.includes('PEGAR_AQUI') || !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(API_URL)) {
    throw new Error('Configura en js/config.js la URL /exec de Apps Script (https://script.google.com/macros/s/.../exec).');
  }
  const build = API_MAP[action];
  if (!build) throw new Error('Acción de frontend no mapeada: ' + action);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain;charset=utf-8'},
      body: JSON.stringify(build(args)),
      redirect: 'follow',
      signal: ctrl.signal
    });
  } catch (err) {
    throw new Error(err.name === 'AbortError'
      ? 'El servidor tardó demasiado en responder. Inténtalo de nuevo.'
      : 'No se pudo conectar con Apps Script. Revisa tu conexión y que la implementación tenga acceso "Cualquier persona".');
  } finally {
    clearTimeout(timer);
  }

  let result;
  try { result = await response.json(); }
  catch (_) { throw new Error('Apps Script no devolvió JSON. Revisa la URL /exec, que el acceso sea "Cualquier persona" y que hayas publicado una nueva versión.'); }
  if (!result.exito) {
    const e = new Error(result.error || 'El servidor rechazó la operación.');
    e.code = result.codigo || '';
    throw e;
  }
  return result.data;
}

// Cloudflare Worker: GitHub Pages -> Worker -> Apps Script Web App.
// Configure secrets: GAS_EXEC_URL (URL /exec), ALLOWED_ORIGIN (https://USER.github.io).
const cors = origin => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin'
});
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '';
    if (origin !== allowed) return new Response('Origin no autorizado', {status:403});
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors(origin)});
    if (request.method !== 'POST') return new Response('Método no permitido',{status:405,headers:cors(origin)});
    let body;
    try { body = await request.text(); JSON.parse(body); }
    catch (_) { return Response.json({exito:false,error:'JSON inválido.'},{status:400,headers:cors(origin)}); }
    try {
      const upstream = await fetch(env.GAS_EXEC_URL, {
        method: 'POST',
        headers: {'Content-Type':'text/plain;charset=utf-8'},
        body
      });
      const text = await upstream.text();
      let data;
      try { data = JSON.parse(text); }
      catch (_) { throw new Error('Apps Script no devolvió JSON. Verifica el despliegue /exec y sus permisos.'); }
      return Response.json(data,{status:200,headers:{...cors(origin),'Cache-Control':'no-store'}});
    } catch (err) {
      return Response.json({exito:false,error:err.message||'No fue posible contactar Apps Script.'},{status:502,headers:cors(origin)});
    }
  }
};

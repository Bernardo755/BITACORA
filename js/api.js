/* ============================================================
   CAPA HTTP: GitHub Pages -> Cloudflare Worker -> Apps Script
   ============================================================ */
const API_URL = window.BITACORA_CONFIG && window.BITACORA_CONFIG.API_URL;

async function server(action,...args){
  if(!API_URL || API_URL.includes('TU-WORKER')) {
    throw new Error('Configura la URL de Cloudflare Worker en js/config.js.');
  }
  const payload={accion:action};
  switch(action){
    case 'login': payload.usuario=args[0]; payload.password=args[1]; break;
    case 'logout': payload.token=args[0]; break;
    case 'apiBootstrap': payload.token=args[0]; payload.accion='bootstrap'; break;
    case 'apiRegister': payload.token=args[0]; payload.data=args[1]; payload.accion='registrarAtencion'; break;
    case 'apiCompare': payload.token=args[0]; payload.query=args[1]; payload.type=args[2]; payload.accion='compararBase'; break;
    case 'apiAlerts': payload.token=args[0]; payload.accion='alertas'; break;
    case 'apiResolveAlert': payload.token=args[0]; payload.id=args[1]; payload.accion='resolverAlerta'; break;
    case 'apiAddTramite': payload.token=args[0]; payload.name=args[1]; payload.accion='agregarTramite'; break;
    case 'apiCreateUser': payload.token=args[0]; payload.data=args[1]; payload.accion='crearUsuario'; break;
    case 'buscarPersonas': payload.token=args[0]; payload.query=args[1]; payload.type=args[2]; payload.accion='buscarPersonas'; break;
    case 'obtenerExpediente': payload.token=args[0]; payload.personId=args[1]; payload.accion='obtenerExpediente'; break;
    default: throw new Error('Acción de frontend no mapeada: '+action);
  }
  const response=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!response.ok) throw new Error('Error HTTP '+response.status+' al comunicarse con la API.');
  const result=await response.json();
  if(!result.exito) throw new Error(result.error||'El servidor rechazó la operación.');
  return result.data;
}

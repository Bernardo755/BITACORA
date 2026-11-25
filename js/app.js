
/* ============================================================
   FRONTEND MODULAR
   A. Estado y sesión
   B. Comunicación segura con Apps Script
   C. Navegación
   D. Login / cierre de sesión
   E. Dashboard y catálogos
   F. Registro
   G. Comparador
   H. Alertas
   I. Vencimiento de sesión
   ============================================================ */
const State = {token:null,user:null,expiresAt:null,warningAt:null,warningShown:false,catalogs:null,dirty:false};
const $ = id => document.getElementById(id);


function toast(message,bad=false){
  const el=$('toast');el.textContent=message;el.className='toast show'+(bad?' bad':'');
  setTimeout(()=>el.className='toast',3500);
}
function setBusy(button,busy,label){
  if(!button)return;
  if(busy){button.dataset.old=button.textContent;button.disabled=true;button.textContent=label||'Procesando...';}
  else{button.disabled=false;button.textContent=button.dataset.old||button.textContent;}
}
function showView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
  $('view-'+name).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  $('pageTitle').textContent=({dashboard:'Dashboard',registro:'Nueva atención',comparador:'Comparador',alertas:'Alertas'})[name]||name;
  if(name==='alertas')loadAlerts();
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.go)));

async function startApp(auth){
  State.token=auth.token;State.user=auth.user;State.expiresAt=new Date(auth.expiresAt);State.warningAt=new Date(auth.warningAt);State.warningShown=false;
  $('loginView').classList.add('hidden');$('appView').classList.remove('hidden');
  $('topUser').textContent=auth.user.name;$('sideUser').textContent=auth.user.name+' · '+auth.user.role;
  $('regUser').value=auth.user.name;
  $('regDate').value=new Date().toISOString().slice(0,10);
  $('todayLabel').textContent=new Date().toLocaleDateString('es-MX',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  await loadBootstrap();
  beginSessionMonitor();
}
async function loadBootstrap(){
  const data=await server('apiBootstrap',State.token);
  State.catalogs=data.catalogs;
  $('statToday').textContent=data.dashboard.todayCount;
  $('statOpen').textContent=data.dashboard.openCount;
  $('statAlerts').textContent=data.dashboard.pendingAlerts;
  $('statDone').textContent=data.dashboard.completed;
  $('tramite').innerHTML='<option value="">Selecciona un trámite</option>'+data.catalogs.tramites.map(x=>`<option>${escapeHtml(x)}</option>`).join('');
  $('status').innerHTML='<option value="">Selecciona estatus</option>'+data.catalogs.estatus.map(x=>`<option>${escapeHtml(x)}</option>`).join('');
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();const btn=e.submitter;setBusy(btn,true,'Validando...');
  $('loginError').textContent='';
  try{const auth=await server('login',$('loginUser').value,$('loginPassword').value);$('loginPassword').value='';await startApp(auth);}
  catch(err){$('loginError').textContent=err.message;}
  finally{setBusy(btn,false);}
});

async function endSession(message){
  const token=State.token;State.token=null;State.user=null;
  if(token){try{await server('logout',token);}catch(e){}}
  $('appView').classList.add('hidden');$('loginView').classList.remove('hidden');$('sessionWarning').classList.add('hidden');
  $('loginError').textContent=message||'La sesión terminó. Inicia sesión nuevamente.';
  State.dirty=false;
}
$('logoutBtn').addEventListener('click',()=>endSession('Sesión cerrada.'));

$('attentionForm').addEventListener('input',()=>{State.dirty=true;});
$('attentionForm').addEventListener('change',()=>{State.dirty=true;});
$('attentionForm').addEventListener('reset',()=>{State.dirty=false;});

$('attentionForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=e.submitter;setBusy(btn,true,'Guardando...');
  const data={
    curp:$('curp').value,name:$('fullName').value,tramite:$('tramite').value,
    telefono:$('phone').value,correo:$('email').value,observaciones:$('notes').value,
    estatus:$('status').value,folio:$('folio').value,fechaSeguimiento:$('followDate').value
  };
  try{
    const result=await server('apiRegister',State.token,data);
    State.dirty=false;$('attentionForm').reset();$('regUser').value=State.user.name;$('regDate').value=new Date().toISOString().slice(0,10);
    $('registerMessage').textContent=result.existingPerson?'Atención guardada. La persona ya tenía antecedentes; se agregó al mismo expediente.':'Atención guardada correctamente.';
    toast('Atención registrada correctamente.');
    await loadBootstrap();
  }catch(err){if(/sesión|sesion|venció|cerrada/i.test(err.message))return endSession(err.message);$('registerMessage').textContent=err.message;toast(err.message,true);}
  finally{setBusy(btn,false);}
});

$('compareBtn').addEventListener('click',async()=>{
  const btn=$('compareBtn');setBusy(btn,true,'Buscando...');
  $('compareResults').innerHTML='<tr><td colspan="5">Buscando coincidencias...</td></tr>';
  try{
    const result=await server('apiCompare',State.token,$('compareQuery').value,$('compareType').value);
    $('compareMessage').textContent=result.message+(result.total!==undefined?' Total: '+result.total+'.':'');
    $('compareResults').innerHTML=result.results.length?result.results.map(r=>`<tr><td>${r.fila}</td><td>${escapeHtml(r.S)}</td><td>${escapeHtml(r.O)}</td><td>${escapeHtml(r.P)}</td><td>${escapeHtml(r.M)}</td></tr>`).join(''):'<tr><td colspan="5" class="muted">Sin coincidencias.</td></tr>';
    if(result.hasMore)toast('Hay más de 25 coincidencias. Refina la búsqueda.');
    if(result.truncated)toast('La búsqueda alcanzó el límite de filas configurado.',true);
  }catch(err){$('compareMessage').textContent=err.message;if(/sesión|sesion|venció|cerrada/i.test(err.message))endSession(err.message);}
  finally{setBusy(btn,false);}
});

async function loadAlerts(){
  $('alertsList').textContent='Cargando alertas...';
  try{
    const items=await server('apiAlerts',State.token);
    $('alertsList').innerHTML=items.length?items.map(a=>`<div class="alert-item"><div><b>${escapeHtml(a.type)} · ${escapeHtml(a.severity)}</b><p class="muted">${escapeHtml(a.description)}</p></div><button class="btn secondary" data-resolve="${escapeHtml(a.id)}">Resolver</button></div>`).join(''):'<p class="muted">No hay alertas pendientes.</p>';
    document.querySelectorAll('[data-resolve]').forEach(b=>b.addEventListener('click',async()=>{try{await server('apiResolveAlert',State.token,b.dataset.resolve);toast('Alerta resuelta.');loadAlerts();loadBootstrap();}catch(e){toast(e.message,true);}}));
  }catch(e){$('alertsList').textContent=e.message;if(/sesión|sesion|venció|cerrada/i.test(e.message))endSession(e.message);}
}

function beginSessionMonitor(){
  if(window.sessionTimer)clearInterval(window.sessionTimer);
  window.sessionTimer=setInterval(()=>{
    if(!State.token)return;
    const now=new Date();
    if(now>=State.expiresAt){endSession('Tu sesión de una hora venció. Inicia sesión nuevamente.');return;}
    if(now>=State.warningAt&&!State.warningShown){
      State.warningShown=true;$('sessionWarning').classList.remove('hidden');
      if(State.dirty)toast('Tienes información sin guardar. Guarda antes del cierre de sesión.',true);
    }
  },1000);
}
$('warningClose').addEventListener('click',()=>$('sessionWarning').classList.add('hidden'));

window.addEventListener('beforeunload',e=>{
  if(State.dirty){e.preventDefault();e.returnValue='Tienes información sin guardar.';}
});

// No se restaura un token guardado en el navegador: la sesión siempre inicia con login.
// Esto evita confiar en el estado visual del cliente después de recargar.

$('personSearch').addEventListener('click',async()=>{
  $('personFile').classList.add('hidden');$('personMessage').textContent='Buscando...';$('personResults').textContent='';
  try{const d=await server('buscarPersonas',State.token,$('personQuery').value,$('personType').value);$('personMessage').textContent=d.message+' Total: '+d.total;
  $('personResults').innerHTML=d.results.map(p=>`<div class="alert-item"><div><b>${escapeHtml(p.name)}</b><p class="muted">CURP: ${escapeHtml(p.curp||'Sin CURP')}</p></div><button class="btn secondary" data-person="${escapeHtml(p.id)}">Abrir expediente</button></div>`).join('');document.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>openPerson(b.dataset.person));}
  catch(e){$('personMessage').textContent=e.message;}
});
async function openPerson(id){try{const d=await server('obtenerExpediente',State.token,id);$('personFile').classList.remove('hidden');$('personName').textContent=d.person.name;$('personCurp').textContent='CURP: '+d.person.curp;$('personSummary').textContent='Atenciones: '+d.totalAttentions+' · Estado del proceso: '+(d.process?d.process.status:'Sin proceso');$('personHistory').innerHTML=d.attentions.map(a=>`<article class="panel"><b>${escapeHtml(a.tramite)} — ${escapeHtml(a.estatus)}</b><p>${new Date(a.date).toLocaleString('es-MX')} · ${escapeHtml(a.capturista)}</p><p>${escapeHtml(a.observaciones||'Sin observaciones')}</p><small>Folio: ${escapeHtml(a.folio||'—')}</small></article>`).join('')||'Sin atenciones';$('personAlerts').innerHTML=d.alerts.map(a=>`<p>${escapeHtml(a.type)} · ${escapeHtml(a.severity)} · ${escapeHtml(a.description)}</p>`).join('')||'Sin alertas';$('personFile').scrollIntoView({behavior:'smooth'});}catch(e){toast(e.message,true);}}


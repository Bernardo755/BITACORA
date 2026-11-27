/* ============================================================
   FRONTEND MODULAR
   A. Estado y utilidades   E. Registro
   B. Navegación            F. Comparador y expedientes
   C. Login / sesión        G. Alertas
   D. Dashboard             H. Administración y vencimiento
   ============================================================ */

// ---------- A. Estado y utilidades ----------
const State = {token:null,user:null,expiresAt:null,warningAt:null,warningShown:false,catalogs:null,dirty:false};
const $ = id => document.getElementById(id);
const TITLES = {dashboard:'Dashboard',registro:'Nueva atención',personas:'Personas y expedientes',comparador:'Comparador',alertas:'Alertas',registros:'Registros',admin:'Administración'};

function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function localDate(d=new Date()){const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
function isSessionError(err){return err&&(err.code==='SESION'||/sesión|sesion|venció|cerrada/i.test(err.message));}
function toast(message,bad=false){
  const el=$('toast');el.textContent=message;el.className='toast show'+(bad?' bad':'');
  clearTimeout(toast.t);toast.t=setTimeout(()=>el.className='toast',3500);
}
function setBusy(button,busy,label){
  if(!button)return;
  if(busy){button.dataset.old=button.textContent;button.disabled=true;button.textContent=label||'Procesando...';}
  else{button.disabled=false;button.textContent=button.dataset.old||button.textContent;}
}
// Ejecuta una acción protegida; si la sesión caducó, regresa al login.
async function guarded(fn,onError){
  try{return await fn();}
  catch(err){
    if(isSessionError(err)){endSession(err.message);return;}
    if(onError)onError(err);else toast(err.message,true);
  }
}
function onEnter(input,handler){input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();handler();}});}

// ---------- B. Navegación ----------
function showView(name){
  const view=$('view-'+name);if(!view)return;
  document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
  view.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  $('pageTitle').textContent=TITLES[name]||name;
  if(name==='alertas')loadAlerts();
  if(name==='registros'&&!Reg.loaded)loadRegistros(1);
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.go)));

// ---------- C. Login / sesión ----------
async function startApp(auth){
  State.token=auth.token;State.user=auth.user;State.expiresAt=new Date(auth.expiresAt);State.warningAt=new Date(auth.warningAt);State.warningShown=false;
  $('loginView').classList.add('hidden');$('appView').classList.remove('hidden');
  $('topUser').textContent=auth.user.name;$('sideUser').textContent=auth.user.name+' · '+auth.user.role;
  $('regUser').value=auth.user.name;$('regDate').value=localDate();
  $('todayLabel').textContent=new Date().toLocaleDateString('es-MX',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const canAdmin=['ADMIN','RESP'].includes(auth.user.role);
  $('navAdmin').classList.toggle('hidden',!canAdmin);
  $('roleAdminOption').classList.toggle('hidden',auth.user.role!=='ADMIN');
  showView('dashboard');
  beginSessionMonitor();
  await guarded(loadBootstrap);
}

async function loadBootstrap(){
  const data=await server('apiBootstrap',State.token);
  State.catalogs=data.catalogs;
  fillRegSheets(data.vistas||[]);
  $('statToday').textContent=data.dashboard.todayCount;
  $('statOpen').textContent=data.dashboard.openCount;
  $('statAlerts').textContent=data.dashboard.pendingAlerts;
  $('statDone').textContent=data.dashboard.completed;
  const keepT=$('tramite').value,keepS=$('status').value;
  $('tramite').innerHTML='<option value="">Selecciona un trámite</option>'+data.catalogs.tramites.map(x=>`<option>${escapeHtml(x)}</option>`).join('');
  $('status').innerHTML='<option value="">Selecciona estatus</option>'+data.catalogs.estatus.map(x=>`<option>${escapeHtml(x)}</option>`).join('');
  $('tramite').value=keepT;$('status').value=keepS;
}

$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();const btn=e.submitter;setBusy(btn,true,'Validando...');
  $('loginError').textContent='';
  try{const auth=await server('login',$('loginUser').value,$('loginPassword').value);$('loginPassword').value='';await startApp(auth);}
  catch(err){$('loginError').textContent=err.message;}
  finally{setBusy(btn,false);}
});

async function endSession(message){
  const token=State.token;
  if(!token&&$('appView').classList.contains('hidden'))return;
  State.token=null;State.user=null;State.dirty=false;
  if(window.sessionTimer)clearInterval(window.sessionTimer);
  if(token){try{await server('logout',token);}catch(e){}}
  $('appView').classList.add('hidden');$('loginView').classList.remove('hidden');$('sessionWarning').classList.add('hidden');
  $('loginError').textContent=message||'La sesión terminó. Inicia sesión nuevamente.';
  ['personResults','personMessage','compareMessage','alertsList','regMessage'].forEach(i=>$(i).textContent='');
  $('regHead').innerHTML='';$('regBody').innerHTML='';Reg.loaded=false;
  $('personFile').classList.add('hidden');
}
$('logoutBtn').addEventListener('click',()=>endSession('Sesión cerrada.'));

// ---------- D/E. Registro ----------
$('curp').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'');});
$('attentionForm').addEventListener('input',()=>{State.dirty=true;});
$('attentionForm').addEventListener('change',()=>{State.dirty=true;});
$('attentionForm').addEventListener('reset',()=>{State.dirty=false;$('registerMessage').textContent='';});

$('attentionForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=e.submitter;setBusy(btn,true,'Guardando...');
  const data={
    curp:$('curp').value,name:$('fullName').value,tramite:$('tramite').value,
    telefono:$('phone').value,correo:$('email').value,observaciones:$('notes').value,
    estatus:$('status').value,folio:$('folio').value,fechaSeguimiento:$('followDate').value
  };
  await guarded(async()=>{
    const result=await server('apiRegister',State.token,data);
    State.dirty=false;$('attentionForm').reset();$('regUser').value=State.user.name;$('regDate').value=localDate();
    const extra=result.alerts&&result.alerts.length?' Se generaron '+result.alerts.length+' alerta(s).':'';
    $('registerMessage').textContent=(result.existingPerson?'Atención guardada. La persona ya tenía antecedentes; se agregó al mismo expediente.':'Atención guardada correctamente.')+extra;
    toast('Atención registrada correctamente.');
    await loadBootstrap();
  },err=>{$('registerMessage').textContent=err.message;toast(err.message,true);});
  setBusy(btn,false);
});

// ---------- F. Comparador y expedientes ----------
async function runCompare(){
  const btn=$('compareBtn');setBusy(btn,true,'Buscando...');
  $('compareResults').innerHTML='<tr><td colspan="5">Buscando coincidencias...</td></tr>';
  await guarded(async()=>{
    const result=await server('apiCompare',State.token,$('compareQuery').value,$('compareType').value);
    $('compareMessage').textContent=result.message+(result.total!==undefined?' Total: '+result.total+'.':'');
    $('compareResults').innerHTML=result.results.length?result.results.map(r=>`<tr><td>${escapeHtml(r.fila)}</td><td>${escapeHtml(r.S)}</td><td>${escapeHtml(r.O)}</td><td>${escapeHtml(r.P)}</td><td>${escapeHtml(r.M)}</td></tr>`).join(''):'<tr><td colspan="5" class="muted">Sin coincidencias.</td></tr>';
    if(result.truncated)toast('La búsqueda alcanzó el límite de filas configurado.',true);
    else if(result.hasMore)toast('Hay más de 25 coincidencias. Refina la búsqueda.');
  },err=>{$('compareMessage').textContent=err.message;$('compareResults').innerHTML='<tr><td colspan="5" class="muted">Sin resultados.</td></tr>';});
  setBusy(btn,false);
}
$('compareBtn').addEventListener('click',runCompare);
onEnter($('compareQuery'),runCompare);

async function runPersonSearch(){
  const btn=$('personSearch');setBusy(btn,true,'Buscando...');
  $('personFile').classList.add('hidden');$('personMessage').textContent='Buscando...';$('personResults').textContent='';
  await guarded(async()=>{
    const d=await server('buscarPersonas',State.token,$('personQuery').value,$('personType').value);
    $('personMessage').textContent=d.message+' Total: '+d.total+'.';
    $('personResults').innerHTML=d.results.map(p=>`<div class="alert-item"><div><b>${escapeHtml(p.name)}</b><p class="muted">CURP: ${escapeHtml(p.curp||'Sin CURP')}</p></div><button class="btn secondary" data-person="${escapeHtml(p.id)}">Abrir expediente</button></div>`).join('');
    document.querySelectorAll('[data-person]').forEach(b=>b.addEventListener('click',()=>openPerson(b.dataset.person)));
  },err=>{$('personMessage').textContent=err.message;});
  setBusy(btn,false);
}
$('personSearch').addEventListener('click',runPersonSearch);
onEnter($('personQuery'),runPersonSearch);

async function openPerson(id){
  await guarded(async()=>{
    const d=await server('obtenerExpediente',State.token,id);
    $('personFile').classList.remove('hidden');
    $('personName').textContent=d.person.name;
    $('personCurp').textContent='CURP: '+(d.person.curp||'Sin CURP');
    $('personSummary').textContent='Atenciones: '+d.totalAttentions+' · Estado del proceso: '+(d.process?d.process.status:'Sin proceso');
    $('personHistory').innerHTML=d.attentions.map(a=>`<article class="panel"><b>${escapeHtml(a.tramite)} — ${escapeHtml(a.estatus)}</b><p>${escapeHtml(new Date(a.date).toLocaleString('es-MX'))} · ${escapeHtml(a.capturista)}</p><p>${escapeHtml(a.observaciones||'Sin observaciones')}</p><small>Folio: ${escapeHtml(a.folio||'—')}</small></article>`).join('')||'<p class="muted">Sin atenciones.</p>';
    $('personAlerts').innerHTML=d.alerts.map(a=>`<p>${escapeHtml(a.type)} · ${escapeHtml(a.severity)} · ${escapeHtml(a.description)} <span class="muted">(${escapeHtml(a.status)})</span></p>`).join('')||'<p class="muted">Sin alertas.</p>';
    $('personFile').scrollIntoView({behavior:'smooth'});
  });
}

// ---------- Registros (consulta de hojas por rol) ----------
const Reg={page:1,pages:1,loaded:false};
function fillRegSheets(vistas){
  const sel=$('regSheet'),keep=sel.value;
  sel.innerHTML=vistas.map(v=>`<option value="${escapeHtml(v.id)}">${escapeHtml(v.label)}</option>`).join('');
  if(vistas.some(v=>v.id===keep))sel.value=keep;
}
async function loadRegistros(page=1){
  const btn=$('regSearch');setBusy(btn,true,'Consultando...');
  $('regMessage').textContent='Cargando...';
  await guarded(async()=>{
    const d=await server('apiRegistros',State.token,$('regSheet').value,{page:page,size:Number($('regSize').value),query:$('regQuery').value});
    Reg.page=d.page;Reg.pages=d.pages;Reg.loaded=true;
    $('regHead').innerHTML='<tr>'+d.headers.map(h=>`<th>${escapeHtml(h.replace(/_/g,' '))}</th>`).join('')+'</tr>';
    $('regBody').innerHTML=d.rows.length
      ?d.rows.map(r=>'<tr>'+r.map(c=>`<td title="${escapeHtml(c)}">${escapeHtml(c)}</td>`).join('')+'</tr>').join('')
      :`<tr><td colspan="${d.headers.length}" class="muted">Sin registros.</td></tr>`;
    $('regMessage').textContent=d.total+' registro(s) · Página '+d.page+' de '+Math.max(d.pages,1)
      +(d.truncated?' · Búsqueda limitada a los '+d.scanned+' registros más recientes.':'');
    $('regPrev').disabled=d.page<=1;$('regNext').disabled=d.page>=d.pages;
  },err=>{$('regMessage').textContent=err.message;});
  setBusy(btn,false);
}
$('regSearch').addEventListener('click',()=>loadRegistros(1));
$('regSheet').addEventListener('change',()=>{$('regQuery').value='';loadRegistros(1);});
$('regSize').addEventListener('change',()=>loadRegistros(1));
$('regPrev').addEventListener('click',()=>loadRegistros(Math.max(1,Reg.page-1)));
$('regNext').addEventListener('click',()=>loadRegistros(Reg.page+1));
onEnter($('regQuery'),()=>loadRegistros(1));

// ---------- G. Alertas ----------
async function loadAlerts(){
  $('alertsList').textContent='Cargando alertas...';
  await guarded(async()=>{
    const items=await server('apiAlerts',State.token);
    $('alertsList').innerHTML=items.length?items.map(a=>`<div class="alert-item"><div><b>${escapeHtml(a.type)} · ${escapeHtml(a.severity)}</b><p class="muted">${escapeHtml(a.description)}</p></div><button class="btn secondary" data-resolve="${escapeHtml(a.id)}">Resolver</button></div>`).join(''):'<p class="muted">No hay alertas pendientes.</p>';
  },err=>{$('alertsList').textContent=err.message;});
}
// Delegación de eventos: un solo listener para todos los botones "Resolver".
$('alertsList').addEventListener('click',async e=>{
  const b=e.target.closest('[data-resolve]');if(!b)return;
  setBusy(b,true,'Resolviendo...');
  await guarded(async()=>{await server('apiResolveAlert',State.token,b.dataset.resolve);toast('Alerta resuelta.');await loadAlerts();await loadBootstrap();});
  setBusy(b,false);
});

// ---------- H. Administración y vencimiento ----------
$('userForm').addEventListener('submit',async e=>{
  e.preventDefault();const btn=e.submitter;setBusy(btn,true,'Creando...');
  const data={username:$('newUser').value,name:$('newUserName').value,password:$('newUserPass').value,role:$('newUserRole').value};
  await guarded(async()=>{
    await server('apiCreateUser',State.token,data);
    $('userForm').reset();$('userMessage').textContent='Usuario creado correctamente.';toast('Usuario creado.');
  },err=>{$('userMessage').textContent=err.message;toast(err.message,true);});
  setBusy(btn,false);
});
$('tramiteForm').addEventListener('submit',async e=>{
  e.preventDefault();const btn=e.submitter;setBusy(btn,true,'Agregando...');
  await guarded(async()=>{
    await server('apiAddTramite',State.token,$('newTramite').value);
    $('tramiteForm').reset();$('tramiteMessage').textContent='Trámite agregado.';toast('Trámite agregado.');
    await loadBootstrap();
  },err=>{$('tramiteMessage').textContent=err.message;toast(err.message,true);});
  setBusy(btn,false);
});

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
// No se guarda el token en el navegador: la sesión siempre inicia con login.

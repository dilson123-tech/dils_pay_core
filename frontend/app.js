cd ~/projetos/dils_pay_core/frontend
cp -v app.js app.js.bak 2>/dev/null || true

cat > app.js <<'EOF'
/* Extrato v1 — HTML + JS vanilla (sem build) */

const $ = (id) => document.getElementById(id);

const state = {
  baseUrl: localStorage.getItem('extrato_baseUrl') || '',
  token:   localStorage.getItem('extrato_token')   || '',
  page: 1,
  pageSize: 10,
  start: '',
  end: '',
  tipo: '',
  totals: { credito:0, debito:0, saldo:0, count:0 }
};

const CSV_PARAM='format', CSV_VALUE='csv';

/* === helpers === */
function decodeJWSub(tok){
  try{
    const part = (tok || '').split('.')[1] || '';
    const pad  = part.length % 4 === 2 ? '==' : part.length % 4 === 3 ? '=' : '';
    const b64  = part.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const payload = JSON.parse(atob(b64));
    return payload.sub || payload.user_id || payload.uid || payload.id || '';
  }catch(_){ return ''; }
}

function getPath(){ return `/api/v1/ledger/${decodeJWTSub(state.token)}`; }

function buildQuery(extra={}){
  const q = new URLSearchParams();
  q.set('page', String(state.page));
  q.set('page_size', String(state.pageSize));
  if(state.start) q.set('start', state.start);
  if(state.end)   q.set('end', state.end);
  if(state.tipo)  q.set('tipo', state.tipo);
  for(const [k,v] of Object.entries(extra)) q.set(k,String(v));
  return q.toString();
}
const fmtMoney = (n)=> (Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const pad = (n)=> String(n).padStart(2,'0');
function fmtDate(iso){
  try{
    if(!iso) return '';
    const d = new Date(iso);
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }catch{ return iso || ''; }
}

function setInputsFromState(){
  $('baseUrl').value = state.baseUrl;
  $('token').value   = state.token;
  $('dataIni').value = state.start;
  $('dataFim').value = state.end;
  $('tipo').value    = state.tipo;
  $('pageSize').value= String(state.pageSize);
}
function readInputsToState(){
  state.baseUrl = $('baseUrl').value.trim();
  state.token   = $('token').value.trim();
  state.start   = $('dataIni').value;
  state.end     = $('dataFim').value;
  state.tipo    = $('tipo').value;
  state.pageSize= Number($('pageSize').value)||10;
}

function saveCfg(){
  readInputsToState();
  localStorage.setItem('extrato_baseUrl', state.baseUrl);
  localStorage.setItem('extrato_token',   state.token);
  toast('Config salva.');
}
function clearCfg(){
  localStorage.removeItem('extrato_baseUrl');
  localStorage.removeItem('extrato_token');
  state.baseUrl=''; state.token='';
  setInputsFromState();
  toast('Config limpa.');
}

function toast(msg){
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;right:16px;bottom:16px;background:#0e243f;border:1px solid #22304d;color:#e7ecf6;padding:10px 12px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.25);z-index:9999';
  document.body.appendChild(el);
  setTimeout(()=> el.remove(), 2000);
}

/* === render === */
function renderTable(rows){
  const tbody = $('tbody');
  if(!rows.length){
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Nenhum lançamento encontrado.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r=>`
    <tr>
      <td>${r.id}</td>
      <td>${fmtDate(r.data)}</td>
      <td><span class="badge ${r.tipo==='CREDITO'?'ok':'bad'}">${r.tipo}</span></td>
      <td class="right">${fmtMoney(r.valor)}</td>
      <td>${r.descricao ?? ''}</td>
    </tr>
  `).join('');
}

function renderTotalsFromHeaders(h){
  const getH = (k)=> h.get(k) || h.get(k.toLowerCase());
  const tCred = Number(getH('x-total-credito')||0);
  const tDeb  = Number(getH('x-total-debito')||0);
  const saldo = Number(getH('x-total-saldo-periodo')||0);
  const count = Number(getH('x-total-count')||0);
  if([tCred,tDeb,saldo,count].some(n=>n!==0)){
    $('tCred').textContent  = `Crédito: ${fmtMoney(tCred)}`;
    $('tDeb').textContent   = `Débito: ${fmtMoney(tDeb)}`;
    $('tSaldo').textContent = `Saldo: ${fmtMoney(saldo)}`;
    $('pageInfo').textContent = `Pág. ${state.page} • Total: ${count}`;
    return true;
  }
  return false;
}
function renderTotalsFromPage(rows){
  const cred = rows.filter(r=>r.tipo==='CREDITO').reduce((a,b)=>a+Number(b.valor||0),0);
  const deb  = rows.filter(r=>r.tipo==='DEBITO').reduce((a,b)=>a+Number(b.valor||0),0);
  $('tCred').textContent  = `Crédito: ${fmtMoney(cred)} (página)`;
  $('tDeb').textContent   = `Débito: ${fmtMoney(deb)} (página)`;
  $('tSaldo').textContent = `Saldo: ${fmtMoney(cred-deb)} (página)`;
  $('pageInfo').textContent = `Pág. ${state.page}`;
}

function setLoading(on){
  const btn = $('aplicar');
  if(on){ btn.disabled = true; btn.textContent = 'Carregando...'; }
  else  { btn.disabled = false; btn.textContent = 'Aplicar filtros'; }
}

/* === fetch === */
async function fetchExtrato(){
  readInputsToState();
  if(!state.baseUrl || !state.token){
    toast('Defina BASE_URL e Token.');
    return;
  }
  $('tbody').innerHTML = `<tr><td colspan="5" class="muted">Carregando...</td></tr>`;
  setLoading(true);
  try{
    const url = state.baseUrl.replace(/\/+$/,'') + getPath() + '?' + buildQuery();
    const res = await fetch(url, { headers:{
      'Authorization': 'Bearer ' + state.token,
      'Accept': 'application/json'
    }});
    if(res.status === 405){
      $('tbody').innerHTML = `<tr><td colspan="5" class="danger">Seu backend não tem GET do extrato. Adicione GET /api/v1/ledger/{user_id} (posso te mandar o patch).</td></tr>`;
      return;
    }
    if(!res.ok){
      const txt = await res.text();
      $('tbody').innerHTML = `<tr><td colspan="5" class="danger">Erro ${res.status}: ${txt}</td></tr>`;
      return;
    }
    const data = await res.json();
    renderTable(Array.isArray(data)?data:[]);
    // totais via headers, com fallback na página
    if(!renderTotalsFromHeaders(res.headers)){
      renderTotalsFromPage(Array.isArray(data)?data:[]);
    }
  }catch(err){
    $('tbody').innerHTML = `<tr><td colspan="5" class="danger">${err.message||err}</td></tr>`;
  }finally{
    setLoading(false);
  }
}

async function baixarCSV(){
  readInputsToState();
  if(!state.baseUrl || !state.token){ toast('Defina BASE_URL e Token.'); return; }
  const url = state.baseUrl.replace(/\/+$/,'') + getPath() + '?' + buildQuery({[CSV_PARAM]:CSV_VALUE});
  const res = await fetch(url, { headers:{ 'Authorization':'Bearer '+state.token, 'Accept':'text/csv' }});
  if(!res.ok){ toast('Falha ao baixar CSV'); return; }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'extrato.csv';
  document.body.appendChild(a); a.click(); a.remove();
}

/* === eventos === */
function wire(){
  setInputsFromState();
  $('saveCfg').onclick  = saveCfg;
  $('clearCfg').onclick = ()=>{ clearCfg(); };
  $('aplicar').onclick  = ()=>{ state.page=1; fetchExtrato(); };
  $('limpar').onclick   = ()=>{
    $('dataIni').value=''; $('dataFim').value=''; $('tipo').value='';
    state.start=''; state.end=''; state.tipo=''; state.page=1;
    fetchExtrato();
  };
  $('prev').onclick     = ()=>{ if(state.page>1){ state.page--; fetchExtrato(); } };
  $('next').onclick     = ()=>{ state.page++; fetchExtrato(); };
  $('pageSize').onchange= ()=>{ state.page=1; state.pageSize=Number($('pageSize').value)||10; fetchExtrato(); };
  $('baixarCSV').onclick= baixarCSV;

  // se já tem config, carrega direto
  if(state.baseUrl && state.token) fetchExtrato();
}

document.addEventListener('DOMContentLoaded', wire);
EOF

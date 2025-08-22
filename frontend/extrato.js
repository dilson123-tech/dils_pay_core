/* ==================== DilsPay — extrato.js (limpo e único) ==================== */
"use strict";

/* --------- PATCH fetch: prefixa BASE_URL e injeta Bearer --------- */
(function () {
  const ORIG_FETCH = window.fetch.bind(window);

  function apiBase() {
    return (document.getElementById('BASE_URL')?.value || localStorage.getItem('BASE_URL') || '')
      .trim().replace(/\/+$/, '');
  }
  function apiToken() {
    return (document.getElementById('token')?.value || localStorage.getItem('TOKEN') || '').trim();
  }

  window.apiBase  = window.apiBase  || apiBase;
  window.apiToken = window.apiToken || apiToken;
  window.buildLedgerUrl = window.buildLedgerUrl || ((ledgerId, params) =>
    `${apiBase()}/api/v1/ledger/${ledgerId}?${params.toString()}`);

  window.fetch = function (input, init) {
    let url, req;
    if (typeof input === 'string') { url = input; }
    else if (input && typeof input.url === 'string') { url = input.url; req = input; }
    else { return ORIG_FETCH(input, init); }

    const isAbs = /^https?:\/\//i.test(url);

    // 1) rota relativa de API → prefixa BASE_URL
    if (!isAbs && /(^|\/)api\//i.test(url)) {
      const normalized = ('/' + url.replace(/^\.?\/+/, '')).replace(/\/{2,}/g, '/');
      url = apiBase() + normalized;
    }

    // 2) reescreve 127.0.0.1/localhost:8001 para BASE_URL (se houver)
    const base = apiBase();
    if (base) url = url.replace(/^https?:\/\/(?:127\.0\.0\.1|localhost):8001/i, base);

    // 3) injeta Authorization se faltar
    const headers = new Headers((init && init.headers) || (req && req.headers) || undefined);
    if (!headers.has('Authorization')) {
      const t = apiToken();
      if (t) headers.set('Authorization', 'Bearer ' + t);
    }

    if (typeof input === 'string') {
      return ORIG_FETCH(url, { ...(init || {}), headers });
    } else {
      const opts = { ...(init || {}), headers, method: (init && init.method) || req?.method };
      return ORIG_FETCH(new Request(url, opts));
    }
  };

  console.log('[fetch-patch] ativo. BASE_URL =', apiBase());
})();

/* --------------------- Estado e helpers de UI --------------------- */
const state = {
  page: 1,
  pageSize: 10,
  sortField: "data",
  sortDir: "desc",
  tipo: "",
  start: "",
  end: "",
  lastPageItems: [],
};

const $ = (id) => document.getElementById(id);
const tbody = () => $("tbody") || document.querySelector("#tabela tbody");
const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function showBanner(msg, type="ok"){
  const el = $("banner"); if (!el) { console[type==="error"?"error":"log"](msg); return; }
  el.className = `banner ${type}`; el.textContent = msg; el.style.display = "block";
  clearTimeout(showBanner._t); showBanner._t = setTimeout(()=> el.style.display="none", 5000);
}

function setLoading(on=true){
  document.body.classList.toggle("loading", !!on);
  const b = $("aplicar");
  if (b) { b.disabled = !!on; b.textContent = on ? "Carregando..." : "Aplicar filtros"; }
  if (on) renderSkeletonRows();
}

function renderSortIndicators() {
  document.querySelectorAll("th.sortable").forEach(th=>{
    th.classList.remove("asc","desc","active");
    const key = th.dataset.key;
    if (key === state.sortField) th.classList.add("active", state.sortDir === "asc" ? "asc" : "desc");
  });
}

/* --------------------- Datas helpers --------------------- */
function ensureIsoStart(v){ // aceita "YYYY-MM-DD" e completa T00:00:00
  if (!v) return "";
  return v.length === 10 ? `${v}T00:00:00` : v;
}
function ensureIsoEnd(v){ // aceita "YYYY-MM-DD" e completa T23:59:59
  if (!v) return "";
  return v.length === 10 ? `${v}T23:59:59` : v;
}

/* --------------------- Render da tabela e totais --------------------- */
function renderSkeletonRows(n = state.pageSize || 10) {
  const tb = tbody(); if (!tb) return;
  tb.innerHTML = "";
  for (let i=0;i<n;i++){
    const tr = document.createElement("tr");
    tr.className = "skeleton-row";
    tr.innerHTML = `
      <td><span class="skeleton short"></span></td>
      <td><span class="skeleton long"></span></td>
      <td><span class="skeleton short"></span></td>
      <td class="right"><span class="skeleton price"></span></td>
      <td><span class="skeleton long"></span></td>
    `;
    tb.appendChild(tr);
  }
}

function renderRows(items) {
  const tb = tbody(); if (!tb) return;
  tb.innerHTML = "";

  if (!items?.length){
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5; td.textContent = "Sem dados para os filtros selecionados.";
    tr.appendChild(td); tb.appendChild(tr); return;
  }

  for (const it of items) {
    const tr = document.createElement("tr");

    const tdId = document.createElement("td"); tdId.textContent = String(it.id ?? "");
    const tdDt = document.createElement("td");
    const d = it.data ? new Date(String(it.data).replace(' ', 'T')) : null;
    tdDt.textContent = d && !isNaN(d) ? d.toLocaleString("pt-BR") : (it.data || "");

    const tdTipo = document.createElement("td"); tdTipo.textContent = it.tipo || "";
    const tdVal  = document.createElement("td");
    tdVal.className = (it.tipo === "DEBITO" ? "neg" : "pos") + " right";
    tdVal.textContent = money(it.valor);
    const tdDesc = document.createElement("td"); tdDesc.textContent = it.descricao || "";

    tr.append(tdId, tdDt, tdTipo, tdVal, tdDesc);
    tb.appendChild(tr);
  }
}

function renderTotalsFromHeaders(h){
  const get = (k) => h.get(k) || h.get(k.toLowerCase());
  const c = get("X-Total-Credito"), d = get("X-Total-Debito"), s = get("X-Total-Saldo");
  $("tCred")?.replaceChildren(document.createTextNode(`Crédito: ${money(c)}`));
  $("tDeb") ?.replaceChildren(document.createTextNode(`Débito: ${money(d)}`));
  $("tSaldo")?.replaceChildren(document.createTextNode(`Saldo: ${money(s ?? (Number(c||0)-Number(d||0)))}`));
}

function renderPagination(page, totalPages){
  $("pageInfo")?.replaceChildren(document.createTextNode(`Pág. ${page} de ${totalPages}`));
  const prev = $("prev"), next = $("next");
  if (prev){ prev.disabled = page <= 1; prev.onclick = ()=>{ if (state.page>1){ state.page--; fetchAndRender(); } }; }
  if (next){ next.disabled = page >= totalPages; next.onclick = ()=>{ if (state.page<totalPages){ state.page++; fetchAndRender(); } }; }
}

/* ------------------------ Monta params e fetch ------------------------ */
function readFiltersFromForm(){
  state.pageSize = Number($("pageSize")?.value) || 10;
  state.tipo     = ($("tipo")?.value || "").toUpperCase();
  state.tipo     = (state.tipo === "TODOS") ? "" : state.tipo;
  const di = $("dataIni")?.value || "";
  const df = $("dataFim")?.value || "";
  state.start = ensureIsoStart(di);
  state.end   = ensureIsoEnd(df);
}

function buildParams(){
  const qs = new URLSearchParams({
    page: String(state.page),
    page_size: String(state.pageSize),
    order_by: state.sortField,
    order_dir: state.sortDir
  });
  if (state.tipo)  qs.set("tipo", state.tipo);
  if (state.start) qs.set("start", state.start);
  if (state.end)   qs.set("end",   state.end);
  return qs;
}

async function fetchLedgers(){
  const base = window.apiBase(); if (!base) return [];
  try{
    const r = await fetch(`${base}/api/v1/wallets`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const sel = $("ledgerSelect"); if (!sel) return data;
    sel.innerHTML = "";
    if (!Array.isArray(data) || !data.length){
      sel.innerHTML = `<option value="">(nenhum ledger encontrado)</option>`;
    } else {
      for (const w of data){
        const opt = document.createElement("option");
        opt.value = String(w.id);
        opt.textContent = `#${w.id} — user ${w.user_id} — saldo R$ ${Number(w.saldo).toFixed(2)}`;
        sel.appendChild(opt);
      }
    }
    // Sincroniza com input
    const wanted = String($("ledgerId")?.value || sel.value || "1");
    sel.value = wanted;
    if ($("ledgerId")) $("ledgerId").value = sel.value;
    return data;
  }catch(e){
    showBanner(`Falha ao carregar ledgers: ${e.message}`, "error");
    return [];
  }
}

async function fetchAndRender(){
  try {
    setLoading(true);
    readFiltersFromForm();

    const ledgerId =
      Number($("ledgerId")?.value) ||
      Number($("ledgerSelect")?.value) || 1;

    const url = window.buildLedgerUrl(ledgerId, buildParams());
    const r = await fetch(url);
    if (!r.ok){
      const txt = await r.text().catch(()=> "");
      showBanner(`Erro HTTP ${r.status} — ${txt || r.statusText}`, "error");
      renderRows([]); renderPagination(1,1); return;
    }

    const data = await r.json();
    const rows = Array.isArray(data) ? data : [];
    state.lastPageItems = rows;
    renderRows(rows);

    // Totais + paginação pelos headers
    renderTotalsFromHeaders(r.headers);
    const get = (k) => r.headers.get(k) || r.headers.get(k.toLowerCase());
    const total       = Number(get("X-Total") || get("X-Total-Count") || rows.length || 0);
    const page        = Number(get("X-Page") || state.page);
    const ps          = Number(get("X-Page-Size") || state.pageSize);
    const totalPages  = Number(get("X-Total-Pages") || Math.max(1, Math.ceil(total / Math.max(1, ps))));
    renderPagination(page, totalPages);

  } catch (e){
    console.error(e);
    showBanner(`Falha: ${e?.message || e}`, "error");
    renderRows([]); renderPagination(1,1);
  } finally {
    setLoading(false);
  }
}

/* ------------------------------ CSV -------------------------------- */
function toCSV(rows){
  const header = ["id","data","tipo","valor","descricao"];
  const body = (rows||[]).map(r=>[
    r.id,
    r.data,
    r.tipo,
    String(r.valor ?? "").replace(".",","), // BR
    (r.descricao||"").replace(/\n/g," ").replace(/"/g,'""')
  ]);
  return [header, ...body].map(cols=>cols.map(c=>`"${String(c)}"`).join(";")).join("\n");
}

function download(filename, text){
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(text);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

// CSV via backend (com Authorization) — funciona mesmo se o /csv exigir header
async function openCsv(scope){ // 'all' | 'page'
  const base = window.apiBase(); if (!base) return;
  const ledgerId =
    Number($("ledgerId")?.value) ||
    Number($("ledgerSelect")?.value) || 1;

  const CSV_STYLE = (localStorage.getItem('CSV_STYLE') || 'br');
  const sep = CSV_STYLE === 'us' ? ','   : ';';
  const dec = CSV_STYLE === 'us' ? 'dot' : 'comma';

  // usa o estado ATUAL
  const qs = new URLSearchParams({
    order_by:  state.sortField,
    order_dir: state.sortDir,
    csv_sep:   sep,
    csv_decimal: dec,
  });
  if (state.tipo)  qs.set('tipo', state.tipo);
  if (state.start) qs.set('start', state.start);
  if (state.end)   qs.set('end',   state.end);
  if (scope === 'page'){
    qs.set('page', String(state.page));
    qs.set('page_size', String(state.pageSize));
  }

  const url = `${base}/api/v1/ledger/${ledgerId}/csv?${qs.toString()}`;
  try{
    const r = await fetch(url, { headers: { /* Authorization já vai pelo patch */ }});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = scope === 'page' ? 'extrato_pagina.csv' : 'extrato_tudo.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
  }catch(e){
    showBanner(`CSV falhou: ${e.message}`, 'error');
  }
}

/* ----------------------------- Binds ------------------------------ */
function wireUI(){
  // Salvar / Limpar / Atualizar ledgers
  $("saveCfg")?.addEventListener("click", async ()=>{
    const base = $("BASE_URL")?.value?.trim(); const tok = $("token")?.value?.trim();
    if (base) localStorage.setItem("BASE_URL", base);
    if (tok)  localStorage.setItem("TOKEN", tok);
    showBanner("Config salva.", "ok");
    await fetchLedgers();
  });
  $("clearCfg")?.addEventListener("click", ()=>{
    localStorage.removeItem("BASE_URL");
    localStorage.removeItem("TOKEN");
    showBanner("Config limpa.", "ok");
  });
  $("reloadLedgers")?.addEventListener("click", async ()=>{ await fetchLedgers(); showBanner("Lista de ledgers atualizada.", "ok"); });

  // Filtros
  $("aplicar")?.addEventListener("click", ()=>{ state.page = 1; fetchAndRender(); });
  $("limpar") ?.addEventListener("click", ()=>{
    if ($("dataIni")) $("dataIni").value = "";
    if ($("dataFim")) $("dataFim").value = "";
    $("tipo").value = ""; $("pageSize").value = String(10);
    state.page = 1; fetchAndRender();
  });

  // Presets
  $("presetHoje")?.addEventListener("click", ()=>{
    const d = new Date().toISOString().slice(0,10);
    $("dataIni").value = d; $("dataFim").value = d; state.page = 1; fetchAndRender();
  });
  $("preset7")?.addEventListener("click", ()=>{
    const e=new Date(); const s=new Date(); s.setDate(e.getDate()-6);
    $("dataIni").value=s.toISOString().slice(0,10); $("dataFim").value=e.toISOString().slice(0,10); state.page=1; fetchAndRender();
  });
  $("preset30")?.addEventListener("click", ()=>{
    const e=new Date(); const s=new Date(); s.setDate(e.getDate()-29);
    $("dataIni").value=s.toISOString().slice(0,10); $("dataFim").value=e.toISOString().slice(0,10); state.page=1; fetchAndRender();
  });
  $("presetMes")?.addEventListener("click", ()=>{
    const n=new Date(); const s=new Date(n.getFullYear(),n.getMonth(),1);
    const e=new Date(n.getFullYear(),n.getMonth()+1,0);
    $("dataIni").value=s.toISOString().slice(0,10); $("dataFim").value=e.toISOString().slice(0,10); state.page=1; fetchAndRender();
  });

  // Page size
  $("pageSize")?.addEventListener("change", ()=>{ state.page=1; fetchAndRender(); });

  // Sort nos cabeçalhos
  document.querySelectorAll("th.sortable").forEach(th=>{
    th.addEventListener("click", ()=>{
      const key = th.dataset.key; if (!key) return;
      if (state.sortField === key){ state.sortDir = state.sortDir === "asc" ? "desc" : "asc"; }
      else { state.sortField = key; state.sortDir = "asc"; }
      renderSortIndicators(); state.page = 1; fetchAndRender();
    });
  });

  // CSV local (página atual renderizada)
  $("baixarCSV")?.addEventListener("click", ()=> download("extrato_pagina.csv", toCSV(state.lastPageItems)));

  // CSV via backend (página e tudo) — usa Authorization
  const btnAll =
    document.getElementById('btnCsvTudo') ||
    document.querySelector('[data-action="csv-all"]') ||
    [...document.querySelectorAll('button, a')].find(el => (el.textContent || '').toLowerCase().includes('baixar csv (tudo)'));
  const btnPage =
    document.getElementById('btnCsvPagina') ||
    document.querySelector('[data-action="csv-page"]') ||
    [...document.querySelectorAll('button, a')].find(el => (el.textContent || '').trim().toLowerCase() === 'baixar csv');

  btnAll  && btnAll.addEventListener('click',  e => { e.preventDefault(); openCsv('all');  });
  btnPage && btnPage.addEventListener('click', e => { e.preventDefault(); openCsv('page'); });
}
/* ===== Add-ons: Token TTL + Persistência de filtros + Ping ===== */
function decodeJwtPayload(t){
  try{
    const b = t.split('.')[1];
    const json = atob(b.replace(/-/g,'+').replace(/_/g,'/'));
    return JSON.parse(json);
  }catch{ return null; }
}

function updateTokenTTL(){
  const el = document.getElementById('tokenTTL'); if (!el) return;
  const t = (window.apiToken?.() || '').trim(); if (!t) { el.textContent = ''; return; }
  const p = decodeJwtPayload(t); if (!p?.exp) { el.textContent = ''; return; }
  const mins = Math.max(0, Math.floor((p.exp*1000 - Date.now())/60000));
  el.textContent = `expira em ${mins} min`;
  el.style.color = mins < 5 ? '#f44' : '';
}
setInterval(updateTokenTTL, 30000);

function saveFiltersToLS(){
  const filtros = {
    dataIni:  document.getElementById("dataIni")?.value || "",
    dataFim:  document.getElementById("dataFim")?.value || "",
    tipo:     document.getElementById("tipo")?.value    || "",
    pageSize: document.getElementById("pageSize")?.value|| "10",
    ledger:   document.getElementById("ledgerId")?.value ||
              document.getElementById("ledgerSelect")?.value || ""
  };
  localStorage.setItem("FILTROS", JSON.stringify(filtros));
  if (filtros.ledger) localStorage.setItem("LEDGER_ID", String(filtros.ledger));
}

function restoreFiltersFromLS(){
  try{
    const f = JSON.parse(localStorage.getItem("FILTROS") || "{}");
    if (f.dataIni  && document.getElementById("dataIni"))  document.getElementById("dataIni").value  = f.dataIni;
    if (f.dataFim  && document.getElementById("dataFim"))  document.getElementById("dataFim").value  = f.dataFim;
    if (f.tipo     && document.getElementById("tipo"))     document.getElementById("tipo").value     = f.tipo;
    if (f.pageSize && document.getElementById("pageSize")) document.getElementById("pageSize").value = f.pageSize;
    const led = localStorage.getItem("LEDGER_ID");
    if (led){
      if (document.getElementById("ledgerId"))     document.getElementById("ledgerId").value     = led;
      if (document.getElementById("ledgerSelect")) document.getElementById("ledgerSelect").value = led;
    }
  }catch{}
}

async function testConn(){
  try{
    const base = window.apiBase?.(); if (!base) throw new Error("BASE_URL vazio");
    const r = await fetch(`${base}/api/v1/health`);
    showBanner(r.ok ? "Conectado ✅" : `Falha: HTTP ${r.status}`, r.ok ? "ok" : "error");
  }catch(e){ showBanner(`Sem conexão: ${e.message}`, "error"); }
}


/* ------------------------------ Boot ------------------------------ */
document.addEventListener("DOMContentLoaded", async ()=>{
  // carrega LS nos inputs se vazios
  if ($("BASE_URL") && !$("BASE_URL").value) $("BASE_URL").value = localStorage.getItem("BASE_URL") || "";
  if ($("token")    && !$("token").value)    $("token").value    = localStorage.getItem("TOKEN") || "";

  wireUI();
  renderSortIndicators();
  await fetchLedgers();

  const haveBase = (window.apiBase() || "").length > 0;
  if (haveBase) fetchAndRender();
});
/* ================== fim do extrato.js ================== */

/* ===== Alias: Renovar token => gerar Token DEV ===== */
(function setupRenewAsDev(){
  const getBase = (typeof getBaseUrl === "function")
    ? () => getBaseUrl().replace(/\/$/,"")
    : () => (localStorage.getItem("BASE_URL") || "http://127.0.0.1:8000").replace(/\/$/,"");

  const show = (m,t="info") => { try { (window.showBanner || ((x)=>console.log(`[${t}]`,x)))(m,t); } catch { console.log(`[${t}]`, m); } };
  const setToken = (tok) => { localStorage.setItem("TOKEN", tok); const tf=document.getElementById("token"); if (tf) tf.value = tok; };

  async function extractToken(res){
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = await res.json();
      return typeof j === "string" ? j : (j?.access_token || j?.token || "");
    }
    const txt = await res.text();
    try { const j = JSON.parse(txt); return (typeof j === "string") ? j : (j?.access_token || j?.token || ""); }
    catch { return txt.trim(); }
  }

  async function renewViaDev(){
    const r = await fetch(getBase() + "/api/v1/login/dev", { method:"POST" });
    if (!r.ok) { show(`Falha ao renovar (dev) — HTTP ${r.status}`, "error"); return; }
    const tok = await extractToken(r);
    if (!tok) { show("Falha ao renovar (dev): token vazio.", "error"); return; }
    setToken(tok);
    show("Token renovado via Token DEV ✅", "ok");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const btnDev = document.getElementById("btnLoginDev");
    if (btnDev && !btnDev.__boundRenew) {
      btnDev.disabled = false;
      btnDev.addEventListener("click", (e)=>{ e.preventDefault(); renewViaDev(); });
      btnDev.__boundRenew = true;
    }
    const btnRefresh = document.getElementById("btnRefresh");
    if (btnRefresh && !btnRefresh.__boundRenew) {
      btnRefresh.disabled = false;
      btnRefresh.addEventListener("click", (e)=>{ e.preventDefault(); renewViaDev(); });
      btnRefresh.__boundRenew = true;
    }
  });
})();

// --- Botão Baixar CSV ---
function exportCSV() {
  const rows = document.querySelectorAll("#extratoTable tr");
  if (!rows.length) {
    alert("Nenhum dado para exportar!");
    return;
  }
  let csv = [];
  for (const row of rows) {
    let cols = [...row.querySelectorAll("th,td")].map(td =>
      `"${td.innerText.replace(/"/g, '""')}"`
    );
    csv.push(cols.join(","));
  }
  const blob = new Blob([csv.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "extrato.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

const bCSV = document.querySelector("#btnExportCSV");
if (bCSV) bCSV.onclick = exportCSV;


// === Login real (usuário/senha) ===
async function realLogin() {
  try {
    const user = document.querySelector("#loginUser")?.value?.trim();
    const pass = document.querySelector("#loginPass")?.value ?? "";

    if (!user || !pass) {
      alert("Preencha usuário e senha.");
      return;
    }

    const base = (document.querySelector("#baseUrl")?.value?.trim())
      || localStorage.getItem("BASE_URL")
      || (typeof BASE_URL_DEFAULT !== "undefined" ? BASE_URL_DEFAULT : "");

    if (!base) {
      alert("BASE_URL não configurada.");
      return;
    }

    // UX: trava o botão enquanto autentica
    const btn = document.querySelector("#btnLogin");
    if (btn) { btn.disabled = true; btn.textContent = "Entrando..."; }

    const res = await fetch(`${base}/api/v1/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass })
    });

    if (!res.ok) {
      const msg = res.status === 401 ? "Usuário ou senha inválidos." :
                  res.status === 422 ? "Dados de login inválidos." :
                  `Falha no login (${res.status}).`;
      if (btn) { btn.disabled = false; btn.textContent = "Entrar"; }
      if (typeof showBanner === "function") showBanner(msg, "erro"); else alert(msg);
      return;
    }

    const data = await res.json();
    const token = data?.access_token || data?.token || "";
    if (!token) {
      if (btn) { btn.disabled = false; btn.textContent = "Entrar"; }
      const msg = "Login OK mas sem access_token no payload.";
      if (typeof showBanner === "function") showBanner(msg, "erro"); else alert(msg);
      return;
    }

    // Persistência + integra com fluxo existente
    localStorage.setItem("TOKEN", token);
    const tf = document.querySelector("#token");
    if (tf) tf.value = token;

    if (typeof updateTokenTTL === "function") updateTokenTTL();
    if (typeof scheduleAutoRefresh === "function") scheduleAutoRefresh();

    if (typeof showBanner === "function") showBanner("Login realizado com sucesso ✅", "ok");
    // opcional: recarrega lista após login
    if (typeof loadLedgerPage === "function") loadLedgerPage(1);

  } catch (e) {
    console.warn("[login] erro:", e);
    if (typeof showBanner === "function") showBanner("Erro inesperado no login.", "erro"); else alert("Erro no login.");
  } finally {
    const btn = document.querySelector("#btnLogin");
    if (btn) { btn.disabled = false; btn.textContent = "Entrar"; }
  }
}

// Liga o botão Entrar ao login real (idempotente)
(function bindRealLogin(){
  const btn = document.querySelector("#btnLogin");
  if (btn && !btn.dataset.boundRealLogin) {
    btn.addEventListener("click", (ev) => { ev.preventDefault?.(); realLogin(); });
    btn.dataset.boundRealLogin = "1";
  }
})();

// === PATCH: salvar refresh_token no login real e habilitar Renovar Token ===
(function patchLoginAndRefresh(){
  // Implementa login real salvando também o refresh_token
  async function realLoginPatched() {
    try {
      const user = document.querySelector("#loginUser")?.value?.trim();
      const pass = document.querySelector("#loginPass")?.value ?? "";
      if (!user || !pass) { alert("Preencha usuário e senha."); return; }

      const base = (document.querySelector("#baseUrl")?.value?.trim())
        || localStorage.getItem("BASE_URL")
        || (typeof BASE_URL_DEFAULT !== "undefined" ? BASE_URL_DEFAULT : "");

      const btn = document.querySelector("#btnLogin");
      if (btn) { btn.disabled = true; btn.textContent = "Entrando..."; }

      const res = await fetch(`${base}/api/v1/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass })
      });

      if (!res.ok) {
        const msg = res.status === 401 ? "Usuário ou senha inválidos." :
                    res.status === 422 ? "Dados de login inválidos." :
                    `Falha no login (${res.status}).`;
        if (typeof showBanner === "function") showBanner(msg, "erro"); else alert(msg);
        return;
      }

      const data = await res.json();
      const token = data?.access_token || "";
      const rtok  = data?.refresh_token || "";

      if (!token) {
        const msg = "Login OK, mas sem access_token no payload.";
        if (typeof showBanner === "function") showBanner(msg, "erro"); else alert(msg);
        return;
      }

      localStorage.setItem("TOKEN", token);
      if (rtok) localStorage.setItem("REFRESH_TOKEN", rtok);
      const tf = document.querySelector("#token");
      if (tf) tf.value = token;

      if (typeof updateTokenTTL === "function") updateTokenTTL();
      if (typeof scheduleAutoRefresh === "function") scheduleAutoRefresh();

      if (typeof showBanner === "function") showBanner("Login realizado com sucesso ✅", "ok");
      if (typeof loadLedgerPage === "function") loadLedgerPage(1);
    } catch (e) {
      console.warn("[login] erro:", e);
      if (typeof showBanner === "function") showBanner("Erro inesperado no login.", "erro"); else alert("Erro no login.");
    } finally {
      const btn = document.querySelector("#btnLogin");
      if (btn) { btn.disabled = false; btn.textContent = "Entrar"; }
    }
  }

  // bind idempotente para o botão Entrar
  const btnLogin = document.querySelector("#btnLogin");
  if (btnLogin && !btnLogin.dataset.boundRealLogin) {
    btnLogin.addEventListener("click", (ev) => { ev.preventDefault?.(); realLoginPatched(); });
    btnLogin.dataset.boundRealLogin = "1";
  }

  // Função de renovar token usando refresh_token no corpo (como a API exige)
  async function doRefreshToken() {
    try {
      const base = (document.querySelector("#baseUrl")?.value?.trim())
        || localStorage.getItem("BASE_URL")
        || (typeof BASE_URL_DEFAULT !== "undefined" ? BASE_URL_DEFAULT : "");
      const rtok = localStorage.getItem("REFRESH_TOKEN");
      if (!rtok) {
        const msg = "Sem refresh_token salvo. Faça login novamente.";
        if (typeof showBanner === "function") showBanner(msg, "erro"); else alert(msg);
        return;
      }

      const b = document.querySelector("#btnRefresh");
      if (b) { b.disabled = true; b.textContent = "Renovando..."; }

      const res = await fetch(`${base}/api/v1/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: rtok })
      });

      if (!res.ok) {
        const msg = `Falha ao renovar token (${res.status}).`;
        if (typeof showBanner === "function") showBanner(msg, "erro"); else alert(msg);
        return;
      }

      const data = await res.json();
      const token = data?.access_token || "";
      if (!token) {
        const msg = "Refresh OK, mas sem access_token no payload.";
        if (typeof showBanner === "function") showBanner(msg, "erro"); else alert(msg);
        return;
      }

      localStorage.setItem("TOKEN", token);
      const tf = document.querySelector("#token");
      if (tf) tf.value = token;
      if (typeof updateTokenTTL === "function") updateTokenTTL();
      if (typeof scheduleAutoRefresh === "function") scheduleAutoRefresh();
      if (typeof showBanner === "function") showBanner("Token renovado ✅", "ok");
    } catch (e) {
      console.warn("[refresh] erro:", e);
      if (typeof showBanner === "function") showBanner("Erro inesperado no refresh.", "erro"); else alert("Erro no refresh.");
    } finally {
      const b = document.querySelector("#btnRefresh");
      if (b) { b.disabled = false; b.textContent = "Renovar Token"; }
    }
  }

  // bind idempotente para o botão Renovar Token
  const bRefresh = document.querySelector("#btnRefresh");
  if (bRefresh && !bRefresh.dataset.boundRefresh) {
    bRefresh.addEventListener("click", (ev) => { ev.preventDefault?.(); doRefreshToken(); });
    bRefresh.dataset.boundRefresh = "1";
  }
})();
/* === Hook: salva REFRESH_TOKEN quando /api/v1/login retornar === */
(function hookLoginRefreshToken(){
  if (window.__dils_hookLoginRT__) return; window.__dils_hookLoginRT__=true;
  const ORIG = window.fetch;
  window.fetch = async function(...args){
    const res = await ORIG.apply(this, args);
    try {
      const url = (typeof args[0] === "string") ? args[0] : (args[0]?.url || "");
      const isLogin = url.includes("/api/v1/login");
      if (isLogin && res?.ok) {
        const clone = res.clone();
        clone.json().then(d => {
          if (d && d.refresh_token) localStorage.setItem("REFRESH_TOKEN", d.refresh_token);
        }).catch(()=>{});
      }
    } catch(e) { /* silencia */ }
    return res;
  };
})();
/* === Botão Renovar Token (usa refresh_token no corpo) === */
async function doRefreshToken(){
  try{
    const base = (document.querySelector("#baseUrl")?.value?.trim())
      || localStorage.getItem("BASE_URL")
      || (typeof BASE_URL_DEFAULT !== "undefined" ? BASE_URL_DEFAULT : "");
    const rtok = localStorage.getItem("REFRESH_TOKEN");
    if (!rtok) { if (typeof showBanner==="function") showBanner("Sem refresh_token salvo. Faça login.", "erro"); else alert("Sem refresh_token salvo. Faça login."); return; }

    const b = document.querySelector("#btnRefresh"); if (b){ b.disabled=true; b.textContent="Renovando..."; }

    const r = await fetch(`${base}/api/v1/refresh`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ refresh_token: rtok })
    });

    if (!r.ok){ if (typeof showBanner==="function") showBanner(`Falha ao renovar token (${r.status}).`, "erro"); else alert(`Falha ao renovar token (${r.status}).`); return; }

    const data = await r.json();
    const token = data?.access_token || "";
    if (!token){ if (typeof showBanner==="function") showBanner("Refresh OK, mas sem access_token.", "erro"); else alert("Refresh OK, mas sem access_token."); return; }

    localStorage.setItem("TOKEN", token);
    const tf = document.querySelector("#token"); if (tf) tf.value = token;
    if (typeof updateTokenTTL==="function") updateTokenTTL();
    if (typeof scheduleAutoRefresh==="function") scheduleAutoRefresh();
    if (typeof showBanner==="function") showBanner("Token renovado ✅", "ok");
  } catch(e){
    console.warn("[refresh] erro:", e);
    if (typeof showBanner==="function") showBanner("Erro inesperado no refresh.", "erro"); else alert("Erro no refresh.");
  } finally {
    const b = document.querySelector("#btnRefresh"); if (b){ b.disabled=false; b.textContent="Renovar Token"; }
  }
}
(function bindBtnRefresh(){
  const b = document.querySelector("#btnRefresh");
  if (b && !b.dataset.boundRefresh){
    b.addEventListener("click", ev => { ev.preventDefault?.(); doRefreshToken(); });
    b.dataset.boundRefresh = "1";
  }
})();
/* === Hook: anexar filtros (start, end, tipo, paginação) nas chamadas /api/v1/ledger/{id} === */
(function hookLedgerFilters(){
  if (window.__dils_hookLedgerFilters__) return; window.__dils_hookLedgerFilters__=true;

  function val(el){ return (el && el.value || "").trim(); }
  function pick(selList){
    for (const s of selList){
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  }
  function getFilters(){
    // Tentativas múltiplas de seletores pra ser compatível com seu HTML atual
    const startEl = pick(["#startDate","#dataInicial","[name=start]","[name=data_inicial]","[data-filter=start]"]);
    const endEl   = pick(["#endDate","#dataFinal","[name=end]","[name=data_final]","[data-filter=end]"]);
    const tipoEl  = pick(["#tipo","[name=tipo]","[data-filter=tipo]","select[data-filter]"]);
    const pageEl  = pick(["#page","[name=page]","[data-filter=page]"]);
    const sizeEl  = pick(["#pageSize","[name=page_size]","[data-filter=page_size]"]);

    const start = val(startEl);
    const end   = val(endEl);
    const tipo  = val(tipoEl);
    const page  = val(pageEl);
    const page_size = val(sizeEl);

    const qs = new URLSearchParams();
    if (start) qs.set("start", start);
    if (end) qs.set("end", end);
    if (tipo && tipo !== "Todos") qs.set("tipo", tipo);
    if (page) qs.set("page", page);
    if (page_size) qs.set("page_size", page_size);
    return qs.toString();
  }

  const ORIG = window.fetch;
  window.fetch = function patchedFetch(input, init){
    try{
      let url = (typeof input === "string") ? input : (input?.url || "");
      // detecta rotas /api/v1/ledger/{id}
      const isLedger = /\/api\/v1\/ledger\/\d+($|\?)/.test(url);
      // só GETs
      const method = (init?.method || (typeof input==="object" ? input?.method : "") || "GET").toUpperCase();
      if (isLedger && method === "GET"){
        const hasQuery = url.includes("?");
        const extra = getFilters();
        if (extra){
          url = url + (hasQuery ? "&" : "?") + extra;
          if (typeof input === "string") {
            input = url;
          } else if (input && typeof Request !== "undefined" && input instanceof Request) {
            input = new Request(url, input); // clona Request com URL nova
          }
        }
      }
    }catch(e){ /* silencioso */ }
    return ORIG.call(this, input, init);
  };

  // Botão "Aplicar Filtros" (liga se existir) -> recarrega página 1
  function reloadFirstPage(){
    if (typeof loadLedgerPage === "function") { loadLedgerPage(1); }
    else if (typeof window.updateTable === "function") { window.updateTable(1); }
  }
  const btn = document.querySelector("#btnApplyFilters,[data-action=apply-filters]");
  if (btn && !btn.dataset.boundApply){
    btn.addEventListener("click", ev => { ev.preventDefault?.(); reloadFirstPage(); });
    btn.dataset.boundApply = "1";
  }
})();
/* === Export CSV: usa os MESMOS filtros do extrato e envia Bearer === */
(function dilsCsvExport(){
  if (window.__dils_csvPatch__) return; window.__dils_csvPatch__=true;

  function pick(selList){ for (const s of selList){ const el=document.querySelector(s); if(el) return el; } return null; }
  function val(el){ return (el && el.value || "").trim(); }
  function getBase(){ return (document.querySelector("#baseUrl")?.value?.trim()) || localStorage.getItem("BASE_URL") || (typeof BASE_URL_DEFAULT!=="undefined"?BASE_URL_DEFAULT:""); }
  function getToken(){ return localStorage.getItem("TOKEN") || ""; }

  function getFiltersQS(){
    const startEl = pick(["#startDate","#dataInicial","[name=start]","[name=data_inicial]","[data-filter=start]"]);
    const endEl   = pick(["#endDate","#dataFinal","[name=end]","[name=data_final]","[data-filter=end]"]);
    const tipoEl  = pick(["#tipo","[name=tipo]","[data-filter=tipo]"]);
    const qs = new URLSearchParams();
    const start = val(startEl), end = val(endEl), tipo = val(tipoEl);
    if (start) qs.set("start", start);
    if (end) qs.set("end", end);
    if (tipo && tipo !== "Todos") qs.set("tipo", tipo);
    // ordem default igual à listagem
    qs.set("order_by","data");
    qs.set("order_dir","desc");
    return qs.toString();
  }

  function getLedgerId(){
    // aceita select de ledger ou input "ou digite"
    const sel = document.querySelector("#ledger");
    const input = document.querySelector("#ledgerId") || document.querySelector("[name=ledger_id]");
    let id = null;
    if (sel && sel.value) id = sel.value.toString().match(/\d+/)?.[0];
    if (!id && input && input.value) id = input.value.trim();
    return id;
  }

  async function downloadCsv({all=false}={}){
    const base = getBase();
    const token = getToken();
    const ledgerId = getLedgerId();
    if (!ledgerId){ alert("Selecione um ledger."); return; }

    // monta URL
    const path = `${base}/api/v1/ledger/${ledgerId}/csv`;
    const qs = new URLSearchParams(getFiltersQS()); // já vem com start/end/tipo/order
    if (all){ qs.set("page_size","1000000"); qs.set("page","1"); } // força tudo
    const url = `${path}?${qs.toString()}`;

    // fetch como blob com Bearer
    const r = await fetch(url, {
      method: "GET",
      headers: token ? { "Authorization": `Bearer ${token}` } : {}
    });
    if (!r.ok){ alert(`Falha ao baixar CSV (${r.status}).`); return; }
    const blob = await r.blob();

    // nome coerente
    const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `extrato_${ledgerId}_${all?"tudo":"filtros"}_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // binds
  const bFiltros = document.querySelector("#btnExportCSV,#btnCsvFiltered,[data-action=csv-filtered]");
  if (bFiltros && !bFiltros.dataset.boundCsvF){
    bFiltros.addEventListener("click", ev => { ev.preventDefault?.(); downloadCsv({all:false}); });
    bFiltros.dataset.boundCsvF = "1";
  }
  const bAll = document.querySelector("#btnExportCSVAll,#btnCsvAll,[data-action=csv-all]");
  if (bAll && !bAll.dataset.boundCsvAll){
    bAll.addEventListener("click", ev => { ev.preventDefault?.(); downloadCsv({all:true}); });
    bAll.dataset.boundCsvAll = "1";
  }
})();
/* === Logout: limpa tokens, cancela auto-refresh e reseta UI === */
(function dilsLogout(){
  if (window.__dils_logoutPatch__) return; window.__dils_logoutPatch__ = true;

  function cancelAutoRefresh(){
    // tenta cancelar timers conhecidos
    if (window.__autoRefreshId){ try{ clearInterval(window.__autoRefreshId); }catch{}; window.__autoRefreshId = null; }
    if (window.__autoRefreshTimer){ try{ clearTimeout(window.__autoRefreshTimer); }catch{}; window.__autoRefreshTimer = null; }
    if (typeof cancelScheduledRefresh === "function"){ try{ cancelScheduledRefresh(); }catch{} }
  }

  function wipeTokens(){
    try{
      localStorage.removeItem("TOKEN");
      localStorage.removeItem("REFRESH_TOKEN");
    }catch(e){ console.warn("wipeTokens:", e); }
  }

  function resetUI(){
    const tf = document.querySelector("#token"); if (tf) tf.value = "";
    // se tiver TTL visual, zera
    if (typeof updateTokenTTL === "function"){ try{ updateTokenTTL(0); }catch{} }
    // desabilita botões dependentes (se existirem)
    ["#btnRefresh","#btnExportCSV","#btnExportCSVAll"].forEach(sel=>{
      const b = document.querySelector(sel);
      if (b) b.disabled = false; // mantemos usabilidade; backend rejeita sem token
    });
    // opcional: recarrega tabela (vai cair em 401 e mostrar vazio ou mensagem)
    if (typeof loadLedgerPage === "function"){ try{ loadLedgerPage(1); }catch{} }
  }

  async function doLogout(){
    cancelAutoRefresh();
    wipeTokens();
    resetUI();
    if (typeof showBanner === "function") showBanner("Sessão encerrada. Faça login novamente.", "ok");
  }

  // bind idempotente
  const btn = document.querySelector("#btnLogout, [data-action=logout]");
  if (btn && !btn.dataset.boundLogout){
    btn.addEventListener("click", ev => { ev.preventDefault?.(); doLogout(); });
    btn.dataset.boundLogout = "1";
  }

  // Segurança extra: se a página carregar sem TOKEN, evita 401 ruidoso
  if (!localStorage.getItem("TOKEN")){
    cancelAutoRefresh();
  }
})();
/* === Extra: limpar tabela no logout (UX mais limpa) === */
(function dilsLogoutClearTable(){
  if (window.__dils_logoutClearPatch__) return; window.__dils_logoutClearPatch__ = true;

  function clearTableUI(){
    // limpa tbody da tabela do extrato (id usado no export CSV)
    const tb = document.querySelector("#extratoTable tbody") || document.querySelector("#extratoTable") || null;
    if (tb) tb.innerHTML = "";
    // opcional: zera badges/resumos se existirem
    ["#saldoBadge","#totalCredito","#totalDebito","#paginationInfo"].forEach(sel=>{
      const el = document.querySelector(sel);
      if (el) el.textContent = "";
    });
  }

  // dispara limpeza logo após o clique em "Sair"
  const btn = document.querySelector("#btnLogout, [data-action=logout]");
  if (btn && !btn.dataset.boundLogoutClear){
    btn.addEventListener("click", () => setTimeout(clearTableUI, 150));
    btn.dataset.boundLogoutClear = "1";
  }
})();
/* === Extra: limpar extrato na UI após logout === */
(function dilsLogoutClearTable(){
  if (window.__dils_logoutClearPatch__) return; 
  window.__dils_logoutClearPatch__ = true;

  function clearTableUI(){
    // tenta localizar tbody da tabela de extrato
    const tb = document.querySelector("table tbody") || document.querySelector("tbody");
    if (tb) tb.innerHTML = "";
    // zera resumos/badges
    document.querySelectorAll("#saldoBadge,#totalCredito,#totalDebito").forEach(el=>{
      if (el) el.textContent = "";
    });
  }

  // intercepta clique no botão de logout
  const btn = document.querySelector("#btnLogout, [data-action=logout], #btnSair");
  if (btn && !btn.dataset.boundLogoutClear){
    btn.addEventListener("click", () => setTimeout(clearTableUI, 200));
    btn.dataset.boundLogoutClear = "1";
  }
})();
/* === BASE_URL default: mesma origem da página === */
(function setDefaultBase(){
  if (typeof window.BASE_URL_DEFAULT === "undefined" || !window.BASE_URL_DEFAULT) {
    window.BASE_URL_DEFAULT = window.location.origin;
    try { localStorage.setItem("BASE_URL", window.BASE_URL_DEFAULT); } catch(e){}
    console.log("[BASE_URL_DEFAULT]", window.BASE_URL_DEFAULT);
  }
})();
/* === Auto-fallback de BASE_URL: testa /health e cai p/ window.location.origin === */
(function autoFixBaseUrl(){
  if (window.__dils_baseurlFix__) return; window.__dils_baseurlFix__=true;

  function setBase(url){
    try{ localStorage.setItem("BASE_URL", url); }catch(e){}
    const el = document.querySelector("#baseUrl,[name=base_url]");
    if (el) el.value = url;
    if (typeof showBanner === "function") showBanner(`BASE_URL ajustado para ${url}`, "ok");
    console.log("[BASE_URL]", url);
  }

  async function probe(url){
    try{
      const r = await fetch(`${url.replace(/\/$/,"")}/api/v1/health`, { method:"GET" });
      return r.ok;
    }catch(_){ return false; }
  }

  (async ()=>{
    const origin = window.location.origin;
    let saved = null;
    try{ saved = localStorage.getItem("BASE_URL"); }catch(_){}
    if (!saved){ setBase(origin); return; }
    if (await probe(saved)) return;      // ok, mantém
    if (await probe(origin)) { setBase(origin); return; }
    // se nenhum respondeu, mantém o salvo e deixa o erro aparecer
  })();
})();
/* === Força preencher o input BASE_URL com o valor salvo === */
(function forceBaseUrlInput(){
  if (window.__dils_forceBaseUrl__) return; window.__dils_forceBaseUrl__=true;
  function apply(){
    let v=null; try{ v=localStorage.getItem("BASE_URL"); }catch(_){}
    if (!v) v = window.location.origin;
    const el = document.querySelector("#baseUrl,[name=base_url]");
    if (el && el.value !== v) el.value = v;
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, {once:true});
  } else { apply(); }
})();
/* === Guard: corrige URLs tipo "http://host:port,/api/..." antes do fetch === */
(function fixCommaInFetch(){
  if (window.__dils_fixCommaFetch__) return; window.__dils_fixCommaFetch__ = true;
  const ORIG = window.fetch;
  window.fetch = function(input, init){
    function fix(u){
      try{
        // troca "http://host:port,/algo" -> "http://host:port/algo"
        u = u.replace(/(https?:\/\/[^\/]+),\//, "$1/");
        // remove vírgulas entre host e caminho caso haja mais de uma
        while (/(https?:\/\/[^\/]+),/.test(u)) u = u.replace(/(https?:\/\/[^\/]+),/, "$1");
        return u;
      }catch(_){ return u; }
    }
    if (typeof input === "string"){
      input = fix(input);
    } else if (input && typeof Request !== "undefined" && input instanceof Request){
      input = new Request(fix(input.url), input);
    }
    return ORIG.call(this, input, init);
  };
})();
/* === Normaliza BASE_URL salvo (remove vírgulas/espacos e barra final) === */
(function normalizeBaseUrl(){
  try{
    let v = localStorage.getItem("BASE_URL");
    if (v){
      const nv = v.trim().replace(/,+$/,"").replace(/\/+$/,"");
      if (nv !== v) localStorage.setItem("BASE_URL", nv);
      const el = document.querySelector("#baseUrl,[name=base_url]");
      if (el) el.value = nv || window.location.origin;
    }
  }catch(_){}
})();
/* === Force same-origin for API calls: rewrite host to window.location.origin === */
(function forceSameOriginApi(){
  if (window.__dils_forceSameOrigin__) return; window.__dils_forceSameOrigin__ = true;
  const ORIG = window.fetch;
  function rewriteToOrigin(u){
    try{
      const url = new URL(u, window.location.origin);
      // só mexe em rotas de API
      if (/^\/api\/v1\//.test(url.pathname)) {
        const newUrl = new URL(url.pathname + url.search + url.hash, window.location.origin).toString();
        return newUrl;
      }
      return url.toString();
    }catch(_){ return u; }
  }
  window.fetch = function(input, init){
    if (typeof input === "string") {
      input = rewriteToOrigin(input);
    } else if (input && typeof Request !== "undefined" && input instanceof Request){
      input = new Request(rewriteToOrigin(input.url), input);
    }
    return ORIG.call(this, input, init);
  };
})();
/* ===== Botão Exportar CSV (auto-injetado) ===== */
(function () {
  function addExportCsvButton() {
    if (document.getElementById("btnExportCsv")) return;

    const container =
      document.querySelector("#actions") ||
      document.querySelector(".actions") ||
      document.querySelector("[data-actions]") ||
      document.querySelector("header") ||
      document.body;

    const b = document.createElement("button");
    b.id = "btnExportCsv";
    b.type = "button";
    b.textContent = "Exportar CSV";
    b.title = "Baixar CSV do extrato desta carteira";
    b.style.marginLeft = "8px";

    b.onclick = () => {
      try {
        const base =
          localStorage.getItem("BASE_URL") || (typeof BASE_URL_DEFAULT !== "undefined" ? BASE_URL_DEFAULT : "");
        const id =
          localStorage.getItem("WALLET_ID") ||
          document.querySelector("#walletId")?.value ||
          "1";
        if (!base) throw new Error("BASE_URL não definido");
        if (!id) throw new Error("WALLET_ID não definido");

        // TODO filtros: quando os filtros estiverem prontos, acrescentar querystring aqui
        const url = `${base}/api/v1/ledger/${id}/export`;
        window.location.href = url; // dispara o download
      } catch (e) {
        console.error("[export-csv] falhou:", e);
        alert("Falha ao gerar CSV. Veja o console para detalhes.");
      }
    };

    container.appendChild(b);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addExportCsvButton);
  } else {
    addExportCsvButton();
  }
})();

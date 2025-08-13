// ================= DilsPay — extrato.js (limpo e completo) =================
"use strict";

// LocalStorage key
const LS_KEY = "dilspay_extrato_cfg_v1";

// Estado global
const state = {
  baseUrl: "",
  token: "",
  ledgerId: 1,
  start: "",
  end: "",
  tipo: "",
  page: 1,
  pageSize: 10,
  sortField: "data", // 'data' na UI == criado_em no backend
  sortDir: "desc",
  lastPageItems: [],
  ledgers: [],
};

// Helpers DOM
const $ = (id) => document.getElementById(id);
const getEl = {
  pageInfo: () => $("pageInfo") || $("pagInfo"),
  tCred: () => $("tCred") || $("totCredito"),
  tDeb: () => $("tDeb") || $("totDebito"),
  tSaldo: () => $("tSaldo") || $("totSaldo"),
  tbody: () => $("tbody") || document.querySelector("#tabela tbody"),
};
const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Persistência
function loadLocal() {
  try { Object.assign(state, JSON.parse(localStorage.getItem(LS_KEY) || "{}")); } catch {}
}
function saveLocal() {
  localStorage.setItem(LS_KEY, JSON.stringify({
    baseUrl: state.baseUrl, token: state.token, ledgerId: state.ledgerId,
    start: state.start, end: state.end, tipo: state.tipo,
    page: state.page, pageSize: state.pageSize,
    sortField: state.sortField, sortDir: state.sortDir,
  }));
}

// UI: loading / banner / sort
function setLoading(on = true) {
  document.body.classList.toggle("loading", !!on);
  const b = $("aplicar");
  if (b) { b.disabled = !!on; b.textContent = on ? "Carregando..." : "Aplicar filtros"; }
  if (on) renderSkeletonRows();
}
function showBanner(msg, type="ok"){
  const el = $("banner"); // se não existir, só loga
  console[type === "error" ? "error" : "log"](msg);
  if (!el) return;
  el.className = `banner ${type}`; el.textContent = msg; el.style.display = "block";
  clearTimeout(showBanner._t); showBanner._t = setTimeout(()=> el.style.display="none", 5000);
}
function renderSortIndicators() {
  document.querySelectorAll("th.sortable").forEach(th=>{
    th.classList.remove("asc","desc","active");
    const key = th.dataset.key || th.dataset.field;
    if (key === state.sortField) {
      th.classList.add("active", state.sortDir === "asc" ? "asc" : "desc");
    }
  });
}

// URL da API
function buildURL(){
  const baseUrl = (state.baseUrl || "").replace(/\/+$/, "");
  const ledgerId = Number($("ledgerId")?.value) || Number(state.ledgerId) || 1;

  const params = new URLSearchParams({
    page: String(state.page),
    page_size: String(state.pageSize),
    order_by: state.sortField || "data",
    order_dir: state.sortDir || "desc",
  });
  if (state.tipo) params.set("tipo", state.tipo);
  if (state.start) params.set("start", state.start);
  if (state.end) params.set("end", state.end);

  return `${baseUrl}/api/v1/ledger/${ledgerId}?${params.toString()}`;
}

// Badges de filtros
function calcActiveFilters() {
  const active = [];
  if (state.start || state.end) active.push("datas");
  if (state.tipo) active.push(state.tipo.toLowerCase());
  if (Number(state.pageSize) !== 10) active.push(`itens:${state.pageSize}`);
  return active;
}
function updateBadges() {
  const box = document.getElementById("statusBadges");
  if (!box) return;
  const active = calcActiveFilters();
  if (!active.length) { box.innerHTML = `<span class="pill ghost">0 filtros ativos</span>`; return; }
  box.innerHTML = [
    `<span class="pill ok">${active.length} filtros ativos</span>`,
    ...active.map(x => `<span class="pill">${x}</span>`)
  ].join(" ");
}

// Fetch + render
async function fetchAndRender(){
  try{
    setLoading(true); saveLocal();
    const url = buildURL();
    const headers = { "Content-Type": "application/json" };
    if (state.token?.trim()) headers["Authorization"] = `Bearer ${state.token.trim()}`;

    const resp = await fetch(url, { headers });
    if (!resp.ok){
      const txt = await resp.text().catch(()=> "");
      showBanner(`Erro HTTP ${resp.status} — ${txt || resp.statusText}`, "error");
      renderRows([]); renderTotalsFromPage([]); return;
    }

    const data = await resp.json();
    const rows = Array.isArray(data) ? data : [];
    state.lastPageItems = rows;
    renderRows(rows);

    // Totais pelos headers (globais); fallback = página
    const h = (n) => resp.headers.get(n) || resp.headers.get(n.toLowerCase());
    const hasTotals = !!h("X-Total");
    if (hasTotals){
      getEl.tCred()?.replaceChildren(document.createTextNode(`Crédito: ${money(h("X-Total-Credito"))}`));
      getEl.tDeb()?.replaceChildren(document.createTextNode(`Débito: ${money(h("X-Total-Debito"))}`));
      getEl.tSaldo()?.replaceChildren(document.createTextNode(`Saldo: ${money(h("X-Total-Saldo"))}`));
    } else {
      renderTotalsFromPage(rows);
    }

    // Paginação
    const total = Number(h("X-Total") || rows.length || 0);
    const page  = Number(h("X-Page") || state.page);
    const ps    = Number(h("X-Page-Size") || state.pageSize);
    const totalPages = Number(h("X-Total-Pages") || Math.max(1, Math.ceil(total / Math.max(1, ps))));
    renderPagination(page, totalPages);
    updateBadges();
  }catch(err){
    console.error(err);
    showBanner(`Falha: ${err?.message || err}`, "error");
    renderRows([]); renderTotalsFromPage([]);
  }finally{
    setLoading(false);
  }
}

// Skeleton
function renderSkeletonRows(n = state.pageSize || 10) {
  const tbody = getEl.tbody();
  if (!tbody) return;
  tbody.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const tr = document.createElement("tr");
    tr.className = "skeleton-row";
    tr.innerHTML = `
      <td><span class="skeleton short"></span></td>
      <td><span class="skeleton long"></span></td>
      <td><span class="skeleton short"></span></td>
      <td class="right"><span class="skeleton price"></span></td>
      <td><span class="skeleton long"></span></td>
    `;
    tbody.appendChild(tr);
  }
}

// Linhas reais
function renderRows(items) {
  const tbody = getEl.tbody();
  if (!tbody) { console.warn("tbody não encontrado"); return; }
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

  if (!items || !items.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "Sem dados para os filtros selecionados.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  for (const it of items) {
    const tr = document.createElement("tr");

    const tdId = document.createElement("td");
    tdId.textContent = String(it.id ?? "");

    const tdDt = document.createElement("td");
    const d = it.data ? new Date(it.data) : null;
    tdDt.textContent = d && !isNaN(d) ? d.toLocaleString("pt-BR") : (it.data || "");

    const tdTipo = document.createElement("td");
    tdTipo.textContent = it.tipo || "";

    const tdVal = document.createElement("td");
    tdVal.className = (it.tipo === "DEBITO" ? "neg" : "pos") + " right";
    tdVal.textContent = money(it.valor);

    const tdDesc = document.createElement("td");
    tdDesc.textContent = it.descricao || "";

    tr.append(tdId, tdDt, tdTipo, tdVal, tdDesc);
    tbody.appendChild(tr);
  }
}

// Totais (fallback página)
function renderTotalsFromPage(items){
  const credito = (items||[]).filter(x=>x.tipo==="CREDITO").reduce((a,b)=>a+Number(b.valor||0),0);
  const debito  = (items||[]).filter(x=>x.tipo==="DEBITO").reduce((a,b)=>a+Number(b.valor||0),0);
  const saldo   = credito - debito;
  const elC = getEl.tCred();  if (elC) elC.textContent = `Crédito: ${money(credito)}`;
  const elD = getEl.tDeb();   if (elD) elD.textContent = `Débito: ${money(debito)}`;
  const elS = getEl.tSaldo(); if (elS) elS.textContent = `Saldo: ${money(saldo)}`;
}

// Paginação
function renderPagination(page, totalPages){
  const pinfo = getEl.pageInfo(); if (pinfo) pinfo.textContent = `Pág. ${page} de ${totalPages}`;
  const prev = $("prev"), next = $("next");
  if (prev) {
    prev.disabled = page <= 1;
    prev.onclick = ()=>{ if (state.page>1){ state.page--; fetchAndRender(); } };
  }
  if (next) {
    next.disabled = page >= totalPages;
    next.onclick = ()=>{ if (!next.disabled){ state.page++; fetchAndRender(); } };
  }
}

// ---------- CSV ----------
function download(filename, text){
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(text);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function toCSV(rows){
  const header = ["id","data","tipo","valor","descricao"];
  const body = (rows||[]).map(r=>[
    r.id,
    r.data,
    r.tipo,
    String(r.valor).replace(".",","), // BR
    (r.descricao||"").replace(/\n/g," ").replace(/"/g,'""')
  ]);
  return [header, ...body]
    .map(cols=>cols.map(c=>`"${String(c)}"`).join(";"))
    .join("\n");
}

// Baixar CSV (página atual)
$("baixarCSV")?.addEventListener("click", () => {
  download("extrato.csv", toCSV(state.lastPageItems));
});

// Baixar CSV (Tudo) direto do servidor
$("baixarCSVAll")?.addEventListener("click", () => {
  const base = (state.baseUrl || "").replace(/\/+$/, "");
  const id   = Number($("ledgerId")?.value || state.ledgerId || 1);

  const qs = new URLSearchParams({
    order_by: state.sortField || "data",
    order_dir: state.sortDir || "desc",
  });
  if (state.tipo)  qs.set("tipo", state.tipo);
  if (state.start) qs.set("start", state.start.slice(0,10)); // YYYY-MM-DD
  if (state.end)   qs.set("end",   state.end.slice(0,10));

  // dispara download direto do backend
  window.location.href = `${base}/api/v1/ledger/${id}/csv?${qs.toString()}`;
});


// Ledgers (dropdown)
async function fetchLedgers() {
  const base = (state.baseUrl || "").trim();
  if (!base) return [];
  const headers = { "Content-Type": "application/json" };
  if (state.token?.trim()) headers["Authorization"] = `Bearer ${state.token.trim()}`;

  try {
    const resp = await fetch(`${base}/api/v1/wallets`, { headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    state.ledgers = Array.isArray(data) ? data : [];
    populateLedgerSelect();
    return state.ledgers;
  } catch (e) {
    showBanner(`Falha ao carregar ledgers: ${e.message}`, "error");
    return [];
  }
}
function populateLedgerSelect() {
  const sel = document.getElementById("ledgerSelect");
  if (!sel) return;
  sel.innerHTML = "";
  if (!state.ledgers?.length) {
    sel.innerHTML = `<option value="">(nenhum ledger encontrado)</option>`;
    return;
  }
  for (const w of state.ledgers) {
    const opt = document.createElement("option");
    opt.value = String(w.id);
    opt.textContent = `#${w.id} — user ${w.user_id} — saldo R$ ${Number(w.saldo).toFixed(2)}`;
    sel.appendChild(opt);
  }
  const wanted = String(state.ledgerId || state.ledgers?.[0]?.id || "");
  if (wanted) sel.value = wanted;
  const inp = document.getElementById("ledgerId");
  if (inp && sel.value) inp.value = sel.value;
}

// Form <-> state
function hydrateFormFromState(){
  if ($("baseUrl"))  $("baseUrl").value  = state.baseUrl || "";
  if ($("token"))    $("token").value    = state.token || "";
  if ($("ledgerId")) $("ledgerId").value = state.ledgerId || 1;
  if ($("pageSize")) $("pageSize").value = state.pageSize;
  if ($("tipo"))     $("tipo").value     = state.tipo || "";
  if ($("dataIni"))  $("dataIni").value  = state.start ? new Date(state.start).toISOString().slice(0,10) : "";
  if ($("dataFim"))  $("dataFim").value  = state.end ? new Date(state.end).toISOString().slice(0,10) : "";

  const sel = document.getElementById("ledgerSelect");
  if (sel) {
    const val = String(state.ledgerId || "");
    if (val) sel.value = val;
  }
  updateBadges();
}
function applyConfigFromForm(){
  state.baseUrl = $("baseUrl")?.value?.trim() || state.baseUrl;
  state.token   = $("token")?.value?.trim()   || state.token;
  state.ledgerId= Number($("ledgerId")?.value) || state.ledgerId;
  state.pageSize= Number($("pageSize")?.value) || state.pageSize;
  state.tipo    = $("tipo")?.value || "";
  const di = $("dataIni")?.value || ""; const df = $("dataFim")?.value || "";
  state.start = di ? new Date(di+"T00:00:00").toISOString() : "";
  state.end   = df ? new Date(df+"T23:59:59").toISOString() : "";
  state.page = 1; saveLocal();
}
function applyFilters(){
  applyConfigFromForm();
  fetchAndRender();
}

// Wire da UI (uma única vez)
function wireUI(){
  // Salvar Config
  $("saveCfg")?.addEventListener("click", ()=>{
    applyConfigFromForm();
    showBanner("Config salva.","ok");
    fetchLedgers();          // recarrega dropdown após salvar BASE_URL/token
  });

  // Limpar Config
  $("clearCfg")?.addEventListener("click", ()=>{
    localStorage.removeItem(LS_KEY);
    showBanner("Config limpa.","ok");
    hydrateFormFromState();  // reflete limpeza no formulário
    updateBadges();          // atualiza badges de filtros
  });

  // Aplicar filtros
  $("aplicar")?.addEventListener("click", applyFilters);

  // Limpar datas + reset página
  $("limpar")?.addEventListener("click", ()=>{
    if ($("dataIni")) $("dataIni").value = "";
    if ($("dataFim")) $("dataFim").value = "";
    state.start = ""; state.end = ""; state.page = 1;
    fetchAndRender();
  });

  // Chips de período
  $("presetHoje")?.addEventListener("click", ()=>{
    const d = new Date().toISOString().slice(0,10);
    $("dataIni").value = d; $("dataFim").value = d; applyFilters();
  });
  $("preset7")?.addEventListener("click", ()=>{
    const e=new Date(); const s=new Date(); s.setDate(e.getDate()-6);
    $("dataIni").value=s.toISOString().slice(0,10); $("dataFim").value=e.toISOString().slice(0,10); applyFilters();
  });
  $("preset30")?.addEventListener("click", ()=>{
    const e=new Date(); const s=new Date(); s.setDate(e.getDate()-29);
    $("dataIni").value=s.toISOString().slice(0,10); $("dataFim").value=e.toISOString().slice(0,10); applyFilters();
  });
  $("presetMes")?.addEventListener("click", ()=>{
    const n=new Date(); const s=new Date(n.getFullYear(),n.getMonth(),1);
    const e=new Date(n.getFullYear(),n.getMonth()+1,0);
    $("dataIni").value=s.toISOString().slice(0,10); $("dataFim").value=e.toISOString().slice(0,10); applyFilters();
  });
  $("presetLimpar")?.addEventListener("click", ()=>{ $("limpar")?.click(); });

  // Sort nos cabeçalhos
  document.querySelectorAll("th.sortable").forEach(th=>{
    th.addEventListener("click", ()=>{
      const key = th.dataset.key || th.dataset.field;
      if (!key) return;
      if (state.sortField === key){ state.sortDir = state.sortDir === "asc" ? "desc" : "asc"; }
      else { state.sortField = key; state.sortDir = "asc"; }
      saveLocal(); renderSortIndicators(); fetchAndRender();
    });
  });

  // Page size
  $("pageSize")?.addEventListener("change", ()=>{
    state.pageSize = Number($("pageSize").value) || 10;
    state.page = 1; fetchAndRender();
  });

  // Atualizar lista de ledgers
  $("reloadLedgers")?.addEventListener("click", async () => {
    await fetchLedgers();
    showBanner("Lista de ledgers atualizada.", "ok");
  });

  // Select de ledgers -> sincroniza com o input e aplica filtros
  const selLedger = $("ledgerSelect");
  if (selLedger) {
    selLedger.addEventListener("change", () => {
      state.ledgerId = Number(selLedger.value || 0);
      const inp = $("ledgerId");
      if (inp) inp.value = selLedger.value;
      saveLocal();
      applyFilters();
    });
  }
}

// Boot
document.addEventListener("DOMContentLoaded", ()=>{
  loadLocal();
  hydrateFormFromState();
  renderSortIndicators();
  wireUI();
  fetchLedgers();
  if (state.baseUrl) fetchAndRender(); else updateBadges();
});


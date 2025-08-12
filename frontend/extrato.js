console.log("extrato.js carregado");

// ---------- Estado ----------
const SKEY = "extrato_cfg_v1";
let state = {
  baseUrl: "",
  token: "",
  page: 1,
  pageSize: 10,
  tipo: "",        // "", "CREDITO", "DEBITO"
  dataIni: "",     // "YYYY-MM-DD"
  dataFim: "",     // "YYYY-MM-DD"
  ledgerId: 1,     // selecionável na UI
  sortBy: null,    // 'id' | 'data' | 'tipo' | 'valor' | 'descricao'
  sortDir: "asc",  // 'asc' | 'desc'
};
let lastPageItems = []; // cache da página atual

// ---------- Utils ----------
const $ = (id) => document.getElementById(id);
const fmtBRL = (n) =>
  (typeof n === "number" ? n : Number(n || 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const asStartISO = (d) => (d ? `${d}T00:00:00` : "");
const asEndISO   = (d) => (d ? `${d}T23:59:59` : "");

function fmtDateInput(d){
  const pad = (n)=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function setDateRangeDays(days){
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days-1));
  $("dataIni").value = fmtDateInput(start);
  $("dataFim").value = fmtDateInput(end);
}
function setDateMonthCurrent(){
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth()+1, 0);
  $("dataIni").value = fmtDateInput(start);
  $("dataFim").value = fmtDateInput(end);
}

function saveLocal() { localStorage.setItem(SKEY, JSON.stringify(state)); }
function loadLocal() {
  try {
    const raw = localStorage.getItem(SKEY);
    if (!raw) return;
    Object.assign(state, JSON.parse(raw));
  } catch {}
}

function applyStateToUI() {
  $("baseUrl").value  = state.baseUrl || "";
  $("token").value    = state.token   || "";
  $("dataIni").value  = state.dataIni || "";
  $("dataFim").value  = state.dataFim || "";
  $("tipo").value     = state.tipo ?? "";
  $("pageSize").value = String(state.pageSize || 10);
  if ($("ledgerId")) $("ledgerId").value = String(state.ledgerId || 1);
  updatePageInfo();
}

function readUIToState() {
  state.baseUrl  = ($("baseUrl").value || "").trim().replace(/\/+$/,""); // remove barra final
  state.token    = $("token").value.trim();
  state.dataIni  = $("dataIni").value || "";
  state.dataFim  = $("dataFim").value || "";
  state.tipo     = $("tipo").value || "";
  state.pageSize = Number($("pageSize").value || 10);
  state.ledgerId = Number($("ledgerId")?.value || state.ledgerId || 1);
}

// ---------- Sort helpers ----------
function compareVals(a, b, key){
  if (key === "valor") return (Number(a?.valor||0) - Number(b?.valor||0));
  if (key === "id")    return String(a?.id||"").localeCompare(String(b?.id||""), "pt-BR", {numeric:true});
  if (key === "data") {
    const da = Date.parse(a?.data || "") || 0;
    const db = Date.parse(b?.data || "") || 0;
    return da - db;
  }
  const va = (a?.[key] ?? "").toString().toLowerCase();
  const vb = (b?.[key] ?? "").toString().toLowerCase();
  return va.localeCompare(vb, "pt-BR", {numeric:true});
}
function sortItems(items){
  if (!state.sortBy) return items;
  const arr = items.slice();
  arr.sort((x,y)=>{
    const nx = normItem(x), ny = normItem(y);
    const r = compareVals(nx, ny, state.sortBy);
    return state.sortDir === "asc" ? r : -r;
  });
  return arr;
}
function markSortedColumn(){
  document.querySelectorAll("th.sortable").forEach(th=>{
    th.classList.remove("asc","desc","active");
    if (th.dataset.key === state.sortBy){
      th.classList.add("active", state.sortDir);
    }
  });
}

// ---------- HTTP ----------
async function apiGET(path, params = {}) {
  if (!state.baseUrl) throw new Error("BASE_URL vazia");

  const url = new URL(`${state.baseUrl}${path}`);
  Object.entries(params).forEach(([k, v]) => (v !== "" && v != null) && url.searchParams.set(k, v));

  const headers = { "Accept": "application/json" };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const res = await fetch(url.toString(), { headers });

  const totals = {
    total: Number(res.headers.get("X-Total") || 0),
    tCred: Number(res.headers.get("X-Total-Credito") || 0),
    tDeb : Number(res.headers.get("X-Total-Debito")  || 0),
    tSaldo: Number(res.headers.get("X-Total-Saldo")  || 0),
  };

  if (!res.ok) {
    const text = await res.text().catch(()=> "");
    throw new Error(`HTTP ${res.status} — ${text || res.statusText}`);
  }
  const data = await res.json().catch(()=> ({}));
  return { data, totals };
}

// ---------- Normalização ----------
function normItem(it = {}) {
  return {
    id:        it.id ?? it.ID ?? it.tx_id ?? it.uuid ?? "",
    data:      it.data ?? it.created_at ?? it.createdAt ?? it.timestamp ?? "",
    tipo:      it.tipo ?? it.type ?? it.kind ?? it.direction ?? "",
    valor:     it.valor ?? it.amount ?? it.value ?? 0,
    descricao: it.descricao ?? it.description ?? it.memo ?? it.note ?? ""
  };
}
function extractListAndTotal(payload, headerTotals) {
  const list = Array.isArray(payload)
    ? payload
    : (payload?.items ?? payload?.results ?? payload?.data ?? []);
  const total = headerTotals?.total
    || payload?.total
    || payload?.count
    || (Array.isArray(list) ? list.length : 0);
  return { list, total };
}

// ---------- Render ----------
function clearTable() { $("tbody").innerHTML = ""; }

function renderRows(items) {
  const tbody = $("tbody");
  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;opacity:.7">Nenhum registro encontrado</td></tr>`;
    markSortedColumn();
    return;
  }
  items = sortItems(items);
  tbody.innerHTML = items.map(it => {
    const n = normItem(it);
    return `
      <tr>
        <td>${n.id}</td>
        <td>${(n.data || "").toString().replace("T"," ")}</td>
        <td>${n.tipo}</td>
        <td class="right">${fmtBRL(n.valor)}</td>
        <td>${n.descricao ?? ""}</td>
      </tr>
    `;
  }).join("");
  markSortedColumn();
}

function renderTotals(t) {
  if (!t || (t.tCred === 0 && t.tDeb === 0 && t.tSaldo === 0)) {
    // fallback: soma visível
    let cred = 0, deb = 0;
    [...$("tbody").querySelectorAll("tr")].forEach(tr => {
      const tipo = tr.children[2]?.textContent?.trim();
      const vTxt = tr.children[3]?.textContent?.replace(/[^\d,-]/g, "")
                  .replace(/\./g, "").replace(",", ".") || "0";
      const v = Number(vTxt);
      if (tipo === "CREDITO") cred += v;
      if (tipo === "DEBITO")  deb  += v;
    });
    $("tCred").textContent  = `Crédito: ${fmtBRL(cred)}`;
    $("tDeb").textContent   = `Débito: ${fmtBRL(deb)}`;
    $("tSaldo").textContent = `Saldo: ${fmtBRL(cred - deb)}`;
    return;
  }
  $("tCred").textContent  = `Crédito: ${fmtBRL(t.tCred)}`;
  $("tDeb").textContent   = `Débito: ${fmtBRL(t.tDeb)}`;
  $("tSaldo").textContent = `Saldo: ${fmtBRL(t.tSaldo)}`;
}

function updatePageInfo(total = null) {
  const p = state.page;
  const size = state.pageSize || 10;
  const pages = total != null && total > 0 ? Math.max(1, Math.ceil(total / size)) : 1;
  $("pageInfo").textContent = `Pág. ${p} de ${pages}`;
  $("prev").disabled = (p <= 1);
  $("next").disabled = (total != null && p >= pages);
}

// ---------- Loading ----------
function setLoading(on){
  document.body.classList.toggle("loading", !!on);
}

// ---------- Ações ----------
async function carregarExtrato() {
  readUIToState();
  if (!state.baseUrl) { alert("Defina a BASE_URL"); return; }

  const ledgerId = Number($("ledgerId")?.value || state.ledgerId || 1);

  const params = {
    page: state.page,
    page_size: state.pageSize,
    tipo: state.tipo || "",
    start: asStartISO(state.dataIni),
    end:   asEndISO(state.dataFim),
  };

  try {
    setLoading(true);
    $("aplicar").disabled = true;
    $("aplicar").textContent = "Carregando...";

    const { data, totals } = await apiGET(`/api/v1/ledger/${ledgerId}`, params);
    const { list, total }  = extractListAndTotal(data, totals);

    lastPageItems = list || [];
    renderRows(lastPageItems);
    renderTotals(totals);
    updatePageInfo(total ?? null);
  } catch (err) {
    console.error(err);
    if (/HTTP 401/.test(err.message)) {
      alert("Token inválido/expirado (401). Faça login e cole o token.");
    } else {
      alert(`Erro ao carregar extrato:\n${err.message}`);
    }
  } finally {
    setLoading(false);
    $("aplicar").disabled = false;
    $("aplicar").textContent = "Aplicar filtros";
  }
}

function salvarConfig() {
  readUIToState();
  saveLocal();
  alert("Config salva ✅");
}
function limparConfig() {
  localStorage.removeItem(SKEY);
  Object.assign(state, {
    baseUrl: "", token: "", page: 1, pageSize: 10, tipo: "",
    dataIni: "", dataFim: "", ledgerId: 1, sortBy: null, sortDir: "asc"
  });
  applyStateToUI();
  clearTable();
  renderTotals({ tCred:0, tDeb:0, tSaldo:0 });
}

function aplicarFiltros() { state.page = 1; carregarExtrato(); }
function limparFiltros() {
  $("dataIni").value = "";
  $("dataFim").value = "";
  $("tipo").value = "";
  $("pageSize").value = "10";
  aplicarFiltros();
}
function paginar(dir) {
  state.page += (dir === "next" ? 1 : -1);
  if (state.page < 1) state.page = 1;
  carregarExtrato();
}

function baixarCSV() {
  const rows = [["ID","DATA/HORA","TIPO","VALOR","DESCRIÇÃO"]];
  [...$("tbody").querySelectorAll("tr")].forEach(tr => {
    const cols = [...tr.children].map(td => `"${(td.textContent || "").replace(/"/g,'""')}"`);
    rows.push(cols);
  });
  const csv = rows.map(r => r.join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `extrato_p${state.page}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function baixarCSVAll(){
  readUIToState();
  const ledgerId = Number($("ledgerId")?.value || state.ledgerId || 1);
  const baseParams = {
    page_size: state.pageSize,
    tipo: state.tipo || "",
    start: asStartISO(state.dataIni),
    end:   asEndISO(state.dataFim),
  };

  const rows = [["ID","DATA/HORA","TIPO","VALOR","DESCRIÇÃO"]];
  let page = 1, pages = null;

  try {
    setLoading(true);

    // 1ª página
    let { data, totals } = await apiGET(`/api/v1/ledger/${ledgerId}`, { ...baseParams, page });
    let { list } = extractListAndTotal(data, totals);
    list.forEach(it => {
      const n = normItem(it);
      rows.push([n.id, (n.data||"").toString().replace("T"," "), n.tipo, fmtBRL(n.valor), n.descricao ?? ""]);
    });

    if (totals?.total && baseParams.page_size)
      pages = Math.max(1, Math.ceil(totals.total / baseParams.page_size));

    // Demais páginas
    for (page = 2; !pages || page <= pages; page++){
      const resp = await apiGET(`/api/v1/ledger/${ledgerId}`, { ...baseParams, page });
      const { list } = extractListAndTotal(resp.data, resp.totals);
      if (!list || list.length === 0) break;
      list.forEach(it => {
        const n = normItem(it);
        rows.push([n.id, (n.data||"").toString().replace("T"," "), n.tipo, fmtBRL(n.valor), n.descricao ?? ""]);
      });
      if (!pages && list.length < (baseParams.page_size || 10)) break;
    }
  } catch (e) {
    alert("Falha ao baixar CSV (Tudo): " + e.message);
    return;
  } finally {
    setLoading(false);
  }

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `extrato_${ledgerId}_todas_paginas.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- Expor no escopo global (opcional, ajuda no console) ----------
window.carregarExtrato  = carregarExtrato;
window.aplicarFiltros   = aplicarFiltros;
window.baixarCSV        = baixarCSV;
window.baixarCSVAll     = baixarCSVAll;

// ---------- Bind ----------
document.addEventListener("DOMContentLoaded", () => {
  loadLocal();
  applyStateToUI();

  const bind = (id, fn) => { const el = $(id); if (el) { if (!el.type) el.type = "button"; el.addEventListener("click", fn); } };
  bind("saveCfg", salvarConfig);
  bind("clearCfg", limparConfig);
  bind("aplicar",  (e) => { e.preventDefault(); aplicarFiltros(); });
  bind("limpar",   (e) => { e.preventDefault(); limparFiltros(); });
  bind("prev",     () => paginar("prev"));
  bind("next",     () => paginar("next"));
  bind("baixarCSV", baixarCSV);
  bind("baixarCSVAll", baixarCSVAll);

  $("pageSize")?.addEventListener("change", () => { state.page = 1; carregarExtrato(); });
  $("ledgerId")?.addEventListener("change", () => { state.page = 1; readUIToState(); saveLocal(); carregarExtrato(); });

  // Presets de data
  $("presetHoje")   ?.addEventListener("click", ()=>{ setDateRangeDays(1);  aplicarFiltros(); });
  $("preset7")      ?.addEventListener("click", ()=>{ setDateRangeDays(7);  aplicarFiltros(); });
  $("preset30")     ?.addEventListener("click", ()=>{ setDateRangeDays(30); aplicarFiltros(); });
  $("presetMes")    ?.addEventListener("click", ()=>{ setDateMonthCurrent(); aplicarFiltros(); });
  $("presetLimpar") ?.addEventListener("click", ()=>{ $("dataIni").value=""; $("dataFim").value=""; aplicarFiltros(); });

  // Enter nas datas = aplicar
  ["dataIni","dataFim"].forEach(id=>{
    document.getElementById(id)?.addEventListener("keydown", e=>{
      if(e.key==="Enter"){ e.preventDefault(); aplicarFiltros(); }
    });
  });

  // Sort nos cabeçalhos
  document.querySelectorAll("th.sortable").forEach(th=>{
    th.addEventListener("click", ()=>{
      const key = th.dataset.key;
      if (state.sortBy === key){
        state.sortDir = (state.sortDir === "asc" ? "desc" : "asc");
      } else {
        state.sortBy = key;
        state.sortDir = "asc";
      }
      renderRows(lastPageItems);
    });
  });

  if (state.baseUrl) carregarExtrato();
});

// ================= DilsPay — extrato.js (compat HTML) =================
// Compatível com IDs do seu extrato.html:
// - pageInfo (fallback: pagInfo)
// - tCred/tDeb/tSaldo (fallback: totCredito/totDebito/totSaldo)
// - <th class="sortable" data-key="..."> (fallback: data-field)
// - <tbody id="tbody"> (fallback: querySelector('#tabela tbody'))
// =====================================================================

const LS_KEY = "dilspay_extrato_cfg_v1";

const state = {
  baseUrl: "",
  token: "",
  ledgerId: 1,
  start: "",
  end: "",
  tipo: "",
  page: 1,
  pageSize: 10,
  sortField: "data",
  sortDir: "desc",
  lastPageItems: [],
};

const $ = (id) => document.getElementById(id);

const getEl = {
  pageInfo: () => $("pageInfo") || $("pagInfo"),
  tCred: () => $("tCred") || $("totCredito"),
  tDeb: () => $("tDeb") || $("totDebito"),
  tSaldo: () => $("tSaldo") || $("totSaldo"),
  tbody: () => $("tbody") || document.querySelector("#tabela tbody"),
};

const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

function setLoading(on = true) {
  document.body.classList.toggle("loading", !!on);
  const b = $("aplicar");
  if (b) { b.disabled = !!on; b.textContent = on ? "Carregando..." : "Aplicar filtros"; }
  if (on) renderSkeletonRows();     // <- mostra skeleton enquanto carrega
}


function showBanner(msg, type="ok"){
  const el = $("banner"); // pode não existir no seu HTML — então só loga
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

function buildURL(){
  const baseUrl = (state.baseUrl || "").replace(/\/+$/, "");
  const ledgerId = Number($("ledgerId")?.value) || Number(state.ledgerId) || 1;

  const params = new URLSearchParams({
    page: state.page,
    page_size: state.pageSize,
    order_by: state.sortField || "data",
    order_dir: state.sortDir || "desc",
  });
  if (state.tipo) params.set("tipo", state.tipo);
  if (state.start) params.set("start", state.start);
  if (state.end) params.set("end", state.end);

  return `${baseUrl}/api/v1/ledger/${ledgerId}?${params.toString()}`;
}
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
    console.log("Linhas recebidas da API:", rows.length);
    state.lastPageItems = rows;

    renderRows(rows);

    // Totais pelos headers (globais); fallback = página
    document.body.classList.remove("loading");

    const h = (n) => resp.headers.get(n) || resp.headers.get(n.toLowerCase());
    const hasTotals = !!h("X-Total");
    if (hasTotals){
      const elC = getEl.tCred();  if (elC) elC.textContent  = `Crédito: ${money(h("X-Total-Credito"))}`;
      const elD = getEl.tDeb();   if (elD) elD.textContent  = `Débito: ${money(h("X-Total-Debito"))}`;
      const elS = getEl.tSaldo(); if (elS) elS.textContent  = `Saldo: ${money(h("X-Total-Saldo"))}`;
    } else {
      renderTotalsFromPage(rows);
    }

    // paginação
    const total = Number(h("X-Total") || rows.length || 0);
    const page  = Number(h("X-Page") || state.page);
    const ps    = Number(h("X-Page-Size") || state.pageSize);
    const totalPages = Number(h("X-Total-Pages") || Math.max(1, Math.ceil(total / Math.max(1, ps))));
    renderPagination(page, totalPages);
    updateBadges();     // ✅ só atualiza badges, sem recursão

      
}catch(err){
    console.error(err);
    showBanner(`Falha: ${err?.message || err}`, "error");
    renderRows([]); renderTotalsFromPage([]);
  }finally{
    setLoading(false);
  }
}
function renderSkeletonRows(n = state.pageSize || 10) {
  const tbody = document.getElementById("tbody") || document.querySelector("#tabela tbody");
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
function renderRows(items) {
  const table = document.getElementById("tabela");
  const tbody = document.getElementById("tbody") || table?.querySelector("tbody");
  if (!tbody) { console.warn("tbody não encontrado"); return; }

  // limpa tudo (inclusive skeleton)
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

  // cria linhas reais
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


 


function renderTotalsFromPage(items){
  const credito = (items||[]).filter(x=>x.tipo==="CREDITO").reduce((a,b)=>a+Number(b.valor||0),0);
  const debito  = (items||[]).filter(x=>x.tipo==="DEBITO").reduce((a,b)=>a+Number(b.valor||0),0);
  const elC = getEl.tCred();  if (elC) elC.textContent = `Crédito: ${money(credito)}`;
  const elD = getEl.tDeb();   if (elD) elD.textContent = `Débito: ${money(debito)}`;
  const elS = getEl.tSaldo(); if (elS) elS.textContent = `Saldo: ${money(credito - debito)}`;
}

function renderPagination(page, totalPages){
  const pinfo = getEl.pageInfo(); if (pinfo) pinfo.textContent = `Pág. ${page} de ${totalPages}`;
  const prev = $("prev"), next = $("next");
  if (prev) { prev.disabled = page <= 1; prev.onclick = ()=>{ if (state.page>1){ state.page--; fetchAndRender(); } }; }
  if (next) { next.disabled = page >= totalPages; next.onclick = ()=>{ if (!next.disabled){ state.page++; fetchAndRender(); } }; }
}

// ---------- CSV ----------
function download(filename, text){
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(text);
  a.download = filename; document.body.appendChild(a); a.click(); a.remove();
}
function toCSV(rows){
  const header = ["id","data","tipo","valor","descricao"];
  const body = (rows||[]).map(r=>[
    r.id, r.data, r.tipo, String(r.valor).replace(".",","), (r.descricao||"").replace(/\n/g," ").replace(/"/g,'""')
  ]);
  return [header, ...body].map(cols=>cols.map(c=>`"${String(c)}"`).join(";")).join("\n");
}
$("baixarCSV")?.addEventListener("click", ()=> download("extrato.csv", toCSV(state.lastPageItems)));
$("baixarCSVAll")?.addEventListener("click", async ()=>{
  try{
    setLoading(true);
    const headers = { "Content-Type": "application/json" };
    if (state.token?.trim()) headers["Authorization"] = `Bearer ${state.token.trim()}`;

    const first = await fetch(buildURL(), { headers });
    if (!first.ok) throw new Error(`HTTP ${first.status}`);
    const j1 = await first.json();
    const h = (n) => first.headers.get(n) || first.headers.get(n.toLowerCase());
    const total = Number(h("X-Total") || j1.length || 0);
    const ps = Number(h("X-Page-Size") || state.pageSize);
    const totalPages = Number(h("X-Total-Pages") || Math.max(1, Math.ceil(total / Math.max(1, ps))));
    let all = Array.isArray(j1) ? [...j1] : [];

    for(let p=2;p<=totalPages;p++){
      const url = buildURL().replace(/page=\d+/, `page=${p}`);
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json(); all.push(...j);
    }
    download("extrato_tudo.csv", toCSV(all));
  }catch(e){ showBanner(`Falha CSV (Tudo): ${e.message||e}`,"error"); }
  finally{ setLoading(false); }
});

// ---------- Inicialização ----------
function hydrateFormFromState(){
  if ($("baseUrl"))  $("baseUrl").value  = state.baseUrl || "";
  if ($("token"))    $("token").value    = state.token || "";
  if ($("ledgerId")) $("ledgerId").value = state.ledgerId || 1;
  if ($("pageSize")) $("pageSize").value = state.pageSize;
  if ($("tipo"))     $("tipo").value     = state.tipo || "";
  if ($("dataIni"))  $("dataIni").value  = state.start ? new Date(state.start).toISOString().slice(0,10) : "";
  if ($("dataFim"))  $("dataFim").value  = state.end ? new Date(state.end).toISOString().slice(0,10) : "";
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

document.addEventListener("DOMContentLoaded", ()=>{
  loadLocal(); hydrateFormFromState(); renderSortIndicators();

  $("saveCfg")?.addEventListener("click", ()=>{ applyConfigFromForm(); showBanner("Config salva.","ok"); });
  $("clearCfg")?.addEventListener("click", ()=>{ localStorage.removeItem(LS_KEY); showBanner("Config limpa.","ok"); });

  $("aplicar")?.addEventListener("click", ()=>{ applyConfigFromForm(); fetchAndRender(); });
  $("limpar")?.addEventListener("click", ()=>{
    if ($("dataIni")) $("dataIni").value = "";
    if ($("dataFim")) $("dataFim").value = "";
    state.start = ""; state.end = ""; state.page = 1; fetchAndRender();
  });

  // chips
  $("presetHoje")?.addEventListener("click", ()=>{
    const d = new Date().toISOString().slice(0,10);
    $("dataIni").value = d; $("dataFim").value = d; $("aplicar").click();
  });
  $("preset7")?.addEventListener("click", ()=>{ const e=new Date(); const s=new Date(); s.setDate(e.getDate()-6);
    $("dataIni").value=s.toISOString().slice(0,10); $("dataFim").value=e.toISOString().slice(0,10); $("aplicar").click();
  });
  $("preset30")?.addEventListener("click", ()=>{ const e=new Date(); const s=new Date(); s.setDate(e.getDate()-29);
    $("dataIni").value=s.toISOString().slice(0,10); $("dataFim").value=e.toISOString().slice(0,10); $("aplicar").click();
  });
  $("presetMes")?.addEventListener("click", ()=>{ const n=new Date(); const s=new Date(n.getFullYear(),n.getMonth(),1);
    const e=new Date(n.getFullYear(),n.getMonth()+1,0);
    $("dataIni").value=s.toISOString().slice(0,10); $("dataFim").value=e.toISOString().slice(0,10); $("aplicar").click();
  });
  $("presetLimpar")?.addEventListener("click", ()=>{ $("limpar").click(); });

  // sort nos cabeçalhos
  document.querySelectorAll("th.sortable").forEach(th=>{
    th.addEventListener("click", ()=>{
      const key = th.dataset.key || th.dataset.field; // <- compat
      if (!key) return;
      if (state.sortField === key){ state.sortDir = state.sortDir === "asc" ? "desc" : "asc"; }
      else { state.sortField = key; state.sortDir = "asc"; }
      saveLocal(); renderSortIndicators(); fetchAndRender();
    });
  });

  // mudança de page size
  $("pageSize")?.addEventListener("change", ()=>{ state.pageSize = Number($("pageSize").value)||10; state.page=1; fetchAndRender(); });

  if (state.baseUrl) fetchAndRender();
});

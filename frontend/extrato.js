console.log("[DilsBank] extrato.js carregado de:", document.currentScript?.src);

/* ==================== DilsPay — extrato.js (único e estável) ==================== */
("use strict");

/* ------------------------------------------------------------------ */
/* 1) PATCH do fetch: prefixa BASE_URL em rotas /api e injeta Bearer  */
/* ------------------------------------------------------------------ */
(function () {
  const ORIG_FETCH = window.fetch.bind(window);

  function apiBase() {
    return (document.getElementById("BASE_URL")?.value || localStorage.getItem("BASE_URL") || "")
      .trim()
      .replace(/\/+$/, "");
  }
  function apiToken() {
    return (document.getElementById("token")?.value || localStorage.getItem("TOKEN") || "").trim();
  }

  window.apiBase = window.apiBase || apiBase;
  window.apiToken = window.apiToken || apiToken;
  window.buildLedgerUrl =
    window.buildLedgerUrl ||
    ((ledgerId, params) => `${apiBase()}/api/v1/ledger/${ledgerId}?${params.toString()}`);

  window.fetch = function (input, init) {
    let url, req;
    if (typeof input === "string") {
      url = input;
    } else if (input && typeof input.url === "string") {
      url = input.url;
      req = input;
    } else {
      return ORIG_FETCH(input, init);
    }

    const isAbs = /^https?:\/\//i.test(url);

    // 1) rota relativa de API → prefixa BASE_URL
    if (!isAbs && /(^|\/)api\//i.test(url)) {
      const normalized = ("/" + url.replace(/^\.?\/+/, "")).replace(/\/{2,}/g, "/");
      url = apiBase() + normalized;
    }

    // 2) reescreve 127.0.0.1/localhost:8001 para BASE_URL (se houver)
    const base = apiBase();
    if (base) url = url.replace(/^https?:\/\/(?:127\.0\.0\.1|localhost):8001/i, base);

    // 3) injeta Authorization se faltar
    const headers = new Headers((init && init.headers) || (req && req.headers) || undefined);
    if (!headers.has("Authorization")) {
      const t = apiToken();
      if (t) headers.set("Authorization", "Bearer " + t);
    }

    if (typeof input === "string") {
      return ORIG_FETCH(url, { ...(init || {}), headers });
    } else {
      const opts = { ...(init || {}), headers, method: (init && init.method) || req?.method };
      return ORIG_FETCH(new Request(url, opts));
    }
  };

  console.log("[fetch-patch] ativo. BASE_URL =", apiBase());
})();

/* ----------------------------------------- */
/* 2) Estado, utils de DOM e helpers de UI   */
/* ----------------------------------------- */
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

function showBanner(msg, type = "ok") {
  const el = $("banner");
  if (!el) {
    console[type === "error" ? "error" : "log"](msg);
    return;
  }
  el.className = `banner ${type}`;
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => (el.style.display = "none"), 3500);
}

function setLoading(on = true) {
  document.body.classList.toggle("loading", !!on);
  const b = $("aplicar");
  if (b) {
    b.disabled = !!on;
    b.textContent = on ? "Carregando..." : "Aplicar filtros";
  }
  if (on) renderSkeletonRows();
}

function renderSortIndicators() {
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.classList.remove("asc", "desc", "active");
    const key = th.dataset.key;
    if (key === state.sortField)
      th.classList.add("active", state.sortDir === "asc" ? "asc" : "desc");
  });
}

/* Datas helpers */
function ensureIsoStart(v) {
  return v ? (v.length === 10 ? `${v}T00:00:00` : v) : "";
}
function ensureIsoEnd(v) {
  return v ? (v.length === 10 ? `${v}T23:59:59` : v) : "";
}

/* ----------------------------------------- */
/* 3) Renderização da tabela, totais, pagina */
/* ----------------------------------------- */
function renderSkeletonRows(n = state.pageSize || 10) {
  const tb = tbody();
  if (!tb) return;
  tb.innerHTML = "";

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
    tb.appendChild(tr);
  }
  // (logo depois das helpers e ANTES de renderRows)
  function _normalizeRow(it) {
    if (!it || typeof it !== "object")
      return { id: "", data: "", tipo: "", valor: 0, descricao: "" };

    const id = it.id ?? it.tx_id ?? it.transaction_id ?? it.uuid ?? it.numero ?? it.seq ?? "";

    const dataRaw = it.data ?? it.created_at ?? it.timestamp ?? it.dt ?? it.date ?? "";
    const data = dataRaw ? new Date(String(dataRaw).replace(" ", "T")) : "";

    const tipoRaw = (it.tipo ?? it.type ?? it.kind ?? "").toString().toUpperCase();

    let valor =
      it.valor ??
      it.amount ??
      it.value ??
      it.total ??
      ("valor_centavos" in it ? (Number(it.valor_centavos) || 0) / 100 : 0);

    if (typeof valor === "string") valor = Number(valor.replace(",", "."));
    if (Number.isNaN(valor)) valor = 0;

    let tipo = tipoRaw || (Number(valor) < 0 ? "DEBITO" : "CREDITO");
    if (tipo === "DEBITO" && valor > 0 && (it.sign === "-" || it.debito === true)) valor = -valor;

    const descricao = it.descricao ?? it.description ?? it.memo ?? it.obs ?? it.note ?? "";

    return {
      id,
      data: data && !isNaN(data) ? data.toISOString() : dataRaw || "",
      tipo,
      valor: Number(valor),
      descricao: String(descricao || ""),
    };
  }
}

function normalizeRow(it) {
  if (!it || typeof it !== "object") return { id: "", data: "", tipo: "", valor: 0, descricao: "" };

  const id = it.id ?? it.tx_id ?? it.transaction_id ?? it.uuid ?? it.numero ?? it.seq ?? "";

  const dataRaw = it.data ?? it.created_at ?? it.timestamp ?? it.dt ?? it.date ?? "";
  const data = dataRaw ? new Date(String(dataRaw).replace(" ", "T")) : "";

  const tipoRaw = (it.tipo ?? it.type ?? it.kind ?? "").toString().toUpperCase();

  let valor =
    it.valor ??
    it.amount ??
    it.value ??
    it.total ??
    ("valor_centavos" in it ? (Number(it.valor_centavos) || 0) / 100 : 0);

  if (typeof valor === "string") valor = Number(valor.replace(",", "."));
  if (Number.isNaN(valor)) valor = 0;

  let tipo = tipoRaw || (Number(valor) < 0 ? "DEBITO" : "CREDITO");
  if (tipo === "DEBITO" && valor > 0 && (it.sign === "-" || it.debito === true)) valor = -valor;

  const descricao = it.descricao ?? it.description ?? it.memo ?? it.obs ?? it.note ?? "";

  return {
    id,
    data: data && !isNaN(data) ? data.toISOString() : dataRaw || "",
    tipo,
    valor: Number(valor),
    descricao: String(descricao || ""),
  };
}

function renderRows(items) {
  const tb = tbody();
  if (!tb) return;
  tb.innerHTML = "";

  let rows = (items || []).map(normalizeRow);
  // validação (Zod): filtra linhas inválidas sem quebrar a UI
  try {
    const Z = window.Schemas?.NormalizedRow;
    if (Z) {
      const ok = [];
      for (const r of rows) {
        const res = Z.safeParse(r);
        if (res.success) ok.push(res.data);
        else console.warn("[zod] linha inválida descartada:", res.error?.errors, r);
      }
      rows = ok;
    }
  } catch (err) {
    console.warn("[zod] validação desativada:", err);
  }

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "Sem dados para os filtros selecionados.";
    tr.appendChild(td);
    tb.appendChild(tr);
    return;
  }

  for (const it of rows) {
    const tr = document.createElement("tr");

    const tdId = document.createElement("td");
    tdId.textContent = String(it.id ?? "");

    const tdDt = document.createElement("td");
    const d = it.data ? new Date(String(it.data)) : null;
    tdDt.textContent = d && !isNaN(d) ? d.toLocaleString("pt-BR") : it.data || "";

    const tdTipo = document.createElement("td");
    tdTipo.textContent = it.tipo || "";

    const tdVal = document.createElement("td");
    tdVal.className = (it.tipo === "DEBITO" || Number(it.valor) < 0 ? "neg" : "pos") + " right";
    tdVal.textContent = money(it.valor);

    const tdDesc = document.createElement("td");
    tdDesc.textContent = it.descricao || "";

    tr.append(tdId, tdDt, tdTipo, tdVal, tdDesc);
    tb.appendChild(tr);
  }
}

function renderTotalsFromHeaders(h) {
  const get = (k) => h.get(k) || h.get(k.toLowerCase());
  const c = get("X-Total-Credito"),
    d = get("X-Total-Debito"),
    s = get("X-Total-Saldo");
  $("tCred")?.replaceChildren(document.createTextNode(`Crédito: ${money(c)}`));
  $("tDeb")?.replaceChildren(document.createTextNode(`Débito: ${money(d)}`));
  $("tSaldo")?.replaceChildren(
    document.createTextNode(`Saldo: ${money(s ?? Number(c || 0) - Number(d || 0))}`)
  );
}

function renderPagination(page, totalPages) {
  $("pageInfo")?.replaceChildren(document.createTextNode(`Pág. ${page} de ${totalPages}`));
  const prev = $("prev"),
    next = $("next");
  if (prev) {
    prev.disabled = page <= 1;
    prev.onclick = () => {
      if (state.page > 1) {
        state.page--;
        fetchAndRender();
      }
    };
  }
  if (next) {
    next.disabled = page >= totalPages;
    next.onclick = () => {
      if (state.page < totalPages) {
        state.page++;
        fetchAndRender();
      }
    };
  }
}

/* ----------------------------------------- */
/* 4) Filtros + construção de query string   */
/* ----------------------------------------- */
function readFiltersFromForm() {
  state.pageSize = Number($("pageSize")?.value) || 10;
  state.tipo =
    ($("tipo")?.value || "").toUpperCase() === "TODOS"
      ? ""
      : ($("tipo")?.value || "").toUpperCase();
  const di = $("dataIni")?.value || "";
  const df = $("dataFim")?.value || "";
  state.start = ensureIsoStart(di);
  state.end = ensureIsoEnd(df);
}

function buildParams() {
  const qs = new URLSearchParams({
    page: String(state.page),
    page_size: String(state.pageSize),
    order_by: state.sortField,
    order_dir: state.sortDir,
  });
  if (state.tipo) qs.set("tipo", state.tipo);
  if (state.start) qs.set("start", state.start);
  if (state.end) qs.set("end", state.end);
  return qs;
}

/* ----------------------------------------- */
/* 5) API: ledgers e extrato                 */
/* ----------------------------------------- */
async function fetchLedgers() {
  const base = window.apiBase();
  if (!base) return [];
  try {
    const r = await fetch(`${base}/api/v1/wallets`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const sel = $("ledgerSelect");
    if (!sel) return data;
    sel.innerHTML = "";
    if (!Array.isArray(data) || !data.length) {
      sel.innerHTML = `<option value="">(nenhum ledger encontrado)</option>`;
    } else {
      for (const w of data) {
        const opt = document.createElement("option");
        opt.value = String(w.id ?? w.wallet_id ?? w.ledger_id ?? "");
        const saldo = w.saldo ?? w.balance ?? 0;
        opt.textContent = `#${opt.value} — user ${w.user_id ?? w.owner ?? "-"} — saldo ${money(saldo)}`;
        sel.appendChild(opt);
      }
    }
    // Sincroniza com input
    const wanted = String($("ledgerId")?.value || sel.value || "1");
    sel.value = wanted;
    if ($("ledgerId")) $("ledgerId").value = sel.value;
    return data;
  } catch (e) {
    showBanner("Falha ao carregar ledgers: " + (e && e.message ? e.message : e), "error");
    return [];
  }
}

async function fetchAndRender() {
  try {
    setLoading(true);
    readFiltersFromForm();

    const ledgerId = Number($("ledgerId")?.value) || Number($("ledgerSelect")?.value) || 1;

    const url = window.buildLedgerUrl(ledgerId, buildParams());
    const r = await fetch(url);
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      showBanner(`Erro HTTP ${r.status} — ${txt || r.statusText}`, "error");
      renderRows([]);
      renderPagination(1, 1);
      return;
    }

    const data = await r.json();
    const rows = Array.isArray(data) ? data : [];
    state.lastPageItems = rows;
    renderRows(rows);

    // Totais + paginação pelos headers
    renderTotalsFromHeaders(r.headers);
    const get = (k) => r.headers.get(k) || r.headers.get(k.toLowerCase());
    const total = Number(get("X-Total") || get("X-Total-Count") || rows.length || 0);
    const page = Number(get("X-Page") || state.page);
    const ps = Number(get("X-Page-Size") || state.pageSize);
    const totalPages = Number(
      get("X-Total-Pages") || Math.max(1, Math.ceil(total / Math.max(1, ps)))
    );
    renderPagination(page, totalPages);
  } catch (e) {
    console.error(e);
    showBanner(`Falha: ${e?.message || e}`, "error");
    renderRows([]);
    renderPagination(1, 1);
  } finally {
    setLoading(false);
  }
}

/* ----------------------------------------- */
/* 6) CSV                                    */
/* ----------------------------------------- */
function toCSV(rows) {
  const header = ["id", "data", "tipo", "valor", "descricao"];
  const body = (rows || []).map((r) => [
    r.id,
    r.data,
    r.tipo,
    String(r.valor ?? "").replace(".", ","), // BR
    (r.descricao || "").replace(/\n/g, " ").replace(/"/g, '""'),
  ]);
  return [header, ...body].map((cols) => cols.map((c) => `"${String(c)}"`).join(";")).join("\n");
}

function download(filename, text) {
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(text);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// CSV via backend (com Authorization)
async function openCsv(scope) {
  // 'all' | 'page'
  const base = window.apiBase();
  if (!base) return;
  const ledgerId = Number($("ledgerId")?.value) || Number($("ledgerSelect")?.value) || 1;

  const CSV_STYLE = localStorage.getItem("CSV_STYLE") || "br";
  const sep = CSV_STYLE === "us" ? "," : ";";
  const dec = CSV_STYLE === "us" ? "dot" : "comma";

  const qs = new URLSearchParams({
    order_by: state.sortField,
    order_dir: state.sortDir,
    csv_sep: sep,
    csv_decimal: dec,
  });
  if (state.tipo) qs.set("tipo", state.tipo);
  if (state.start) qs.set("start", state.start);
  if (state.end) qs.set("end", state.end);
  if (scope === "page") {
    qs.set("page", String(state.page));
    qs.set("page_size", String(state.pageSize));
  }

  const url = `${base}/api/v1/ledger/${ledgerId}/csv?${qs.toString()}`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = scope === "page" ? "extrato_pagina.csv" : "extrato_tudo.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (e) {
    showBanner(`CSV falhou: ${e.message}`, "error");
  }
}

function baixarCSV(scope) {
  if (scope === "all") return openCsv("all");
  if (scope === "page-server") return openCsv("page");
  // Local (somente o que está na página renderizada)
  return download("extrato_pagina.csv", toCSV(state.lastPageItems || []));
}

/* ----------------------------------------- */
/* 7) Persistência de filtros                */
/* ----------------------------------------- */
function saveFiltersToLS() {
  const filtros = {
    dataIni: $("dataIni")?.value || "",
    dataFim: $("dataFim")?.value || "",
    tipo: $("tipo")?.value || "",
    pageSize: $("pageSize")?.value || "10",
    ledger: $("ledgerId")?.value || $("ledgerSelect")?.value || "",
  };
  localStorage.setItem("FILTROS", JSON.stringify(filtros));
  if (filtros.ledger) localStorage.setItem("LEDGER_ID", String(filtros.ledger));
}
function restoreFiltersFromLS() {
  try {
    const f = JSON.parse(localStorage.getItem("FILTROS") || "{}");
    if (f.dataIni && $("dataIni")) $("dataIni").value = f.dataIni;
    if (f.dataFim && $("dataFim")) $("dataFim").value = f.dataFim;
    if (f.tipo && $("tipo")) $("tipo").value = f.tipo;
    if (f.pageSize && $("pageSize")) $("pageSize").value = f.pageSize;
    const led = localStorage.getItem("LEDGER_ID");
    if (led) {
      if ($("ledgerId")) $("ledgerId").value = led;
      if ($("ledgerSelect")) $("ledgerSelect").value = led;
    }
  } catch {}
}

/* ----------------------------------------- */
/* 8) Conexão e Login/Refresh                */
/* ----------------------------------------- */
async function testConn() {
  try {
    const base = window.apiBase?.();
    if (!base) throw new Error("BASE_URL vazio");
    const r = await fetch(`${base}/api/v1/health`);
    showBanner(r.ok ? "Conectado ✅" : `Falha: HTTP ${r.status}`, r.ok ? "ok" : "error");
  } catch (e) {
    showBanner(`Sem conexão: ${e.message}`, "error");
  }
}

/* JWT TTL + auto-refresh (único) */
function decodeJwtPayload(t) {
  try {
    const b = (t || "").split(".")[1];
    if (!b) return null;
    const j = atob(b.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(j);
  } catch {
    return null;
  }
}

function updateTokenTTL() {
  const el = document.getElementById("tokenTTL");
  if (!el) return;

  const tok = (window.apiToken?.() || "").trim();
  if (!tok) {
    el.textContent = "";
    el.style.color = "";
    return;
  }

  const p = decodeJwtPayload(tok);
  if (!p?.exp) {
    el.textContent = "";
    el.style.color = "";
    return;
  }

  const mins = Math.max(0, Math.floor((p.exp * 1000 - Date.now()) / 60000));
  el.textContent = `expira em ${mins} min`;
  el.style.color = mins < 5 ? "#f44" : "";
}
window.updateTokenTTL = updateTokenTTL;
setInterval(updateTokenTTL, 30000);

let _autoRefTimer;
function scheduleAutoRefresh() {
  clearTimeout(_autoRefTimer);

  const access = (window.apiToken?.() || "").trim();
  const refresh = localStorage.getItem("REFRESH_TOKEN");
  if (!access || !refresh) return;

  const p = decodeJwtPayload(access);
  if (!p?.exp) return;

  const msLeft = p.exp * 1000 - Date.now();
  const when = Math.max(5000, msLeft - 120000); // 2 min antes (mín 5s)

  console.log("[auto-refresh] agendado para ~", Math.round(when / 1000), "s");
  _autoRefTimer = setTimeout(async () => {
    try {
      const base = window.apiBase?.();
      if (!base) throw new Error("BASE_URL vazio");
      const r = await fetch(`${base}/api/v1/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: localStorage.getItem("REFRESH_TOKEN") }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { access_token } = await r.json();
      if (access_token) {
        localStorage.setItem("TOKEN", access_token);
        const tf = $("token");
        if (tf) tf.value = access_token;
        updateTokenTTL();
        scheduleAutoRefresh(); // agenda a próxima
        showBanner("Token renovado automaticamente ✅", "ok");
      }
    } catch (e) {
      console.warn("[auto-refresh] falhou:", e);
    }
  }, when);
}
window.scheduleAutoRefresh = scheduleAutoRefresh;

/* Login box (seguro e idempotente) */
(function loginBox() {
  const u = $("loginUser");
  const p = $("loginPass");
  const bLogin = $("btnLogin"); // Entrar
  const bLogout = $("btnLogout"); // Sair
  const bDev = $("btnLoginDev"); // Token DEV (dev-only)
  const tokenField = $("token");
  const bRefresh = $("btnRefresh"); // Renovar token

  const SB = (msg, type = "ok") =>
    window.showBanner ? showBanner(msg, type) : console[type === "error" ? "error" : "log"](msg);

  function refreshAuthButtons() {
    const has = !!localStorage.getItem("TOKEN");
    if (bLogin) bLogin.style.display = has ? "none" : "";
    if (bLogout) bLogout.style.display = has ? "" : "none";
  }
  refreshAuthButtons();

  // Atualiza TTL quando colar/editar manualmente o token
  tokenField?.addEventListener("input", () => {
    localStorage.setItem("TOKEN", (tokenField.value || "").trim());
    updateTokenTTL();
    scheduleAutoRefresh();
  });

  // Botão "Renovar token" usando o refresh_token salvo
  bRefresh?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const base = window.apiBase?.();
      if (!base) throw new Error("BASE_URL vazio");
      const rt = localStorage.getItem("REFRESH_TOKEN");
      if (!rt) throw new Error("Sem refresh_token salvo");

      const r = await fetch(`${base}/api/v1/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${await r.text().catch(() => "")}`);

      const { access_token } = await r.json();
      if (!access_token) throw new Error("Resposta sem access_token");

      localStorage.setItem("TOKEN", access_token);
      if (tokenField) tokenField.value = access_token;

      SB("Token renovado ✅", "ok");
      updateTokenTTL();
      scheduleAutoRefresh(); // agenda a próxima renovação automática
      refreshAuthButtons();
    } catch (err) {
      SB(`Falha ao renovar: ${err.message || err}`, "error");
    }
  });

  async function doLogin() {
    try {
      const base = window.apiBase?.();
      if (!base) throw new Error("BASE_URL vazio");
      const username = (u?.value || "").trim();
      const password = (p?.value || "").trim();
      if (!username || !password) throw new Error("Preencha usuário e senha");

      const r = await fetch(`${base}/api/v1/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${await r.text().catch(() => "")}`);

      const { access_token, refresh_token } = await r.json();
      if (!access_token) throw new Error("Sem token");

      if (tokenField) tokenField.value = access_token;
      localStorage.setItem("TOKEN", access_token);
      if (refresh_token) localStorage.setItem("REFRESH_TOKEN", refresh_token);
      else localStorage.removeItem("REFRESH_TOKEN");
      localStorage.setItem("LOGIN_USER", username);

      SB("Login ok ✅", "ok");
      updateTokenTTL();
      scheduleAutoRefresh();
      refreshAuthButtons();
      p && (p.value = "");
    } catch (e) {
      SB(`Falha no login: ${e.message || e}`, "error");
    }
  }

  async function doLoginDev() {
    try {
      const base = window.apiBase?.();
      if (!base) throw new Error("BASE_URL vazio");
      const r = await fetch(`${base}/api/v1/login_dev`, { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const { access_token } = await r.json();
      if (!access_token) throw new Error("Sem token");

      if (tokenField) tokenField.value = access_token;
      localStorage.setItem("TOKEN", access_token);
      localStorage.removeItem("REFRESH_TOKEN"); // dev não usa refresh

      SB("Token DEV gerado", "ok");
      updateTokenTTL();
      scheduleAutoRefresh(); // limpa/agende conforme houver refresh
      refreshAuthButtons();
    } catch (e) {
      SB(`Falha no login_dev: ${e.message || e}`, "error");
    }
  }

  function doLogout(e) {
    e && e.preventDefault && e.preventDefault();
    localStorage.removeItem("TOKEN");
    localStorage.removeItem("REFRESH_TOKEN");
    if (tokenField) tokenField.value = "";
    SB("Saiu da sessão", "ok");
    updateTokenTTL();
    scheduleAutoRefresh(); // limpa o timer (sem refresh)
    refreshAuthButtons();
  }

  bLogin &&
    bLogin.addEventListener("click", (e) => {
      e.preventDefault();
      doLogin();
    });
  bDev &&
    bDev.addEventListener("click", (e) => {
      e.preventDefault();
      doLoginDev();
    });
  bLogout && bLogout.addEventListener("click", doLogout);
  [u, p].forEach(
    (el) =>
      el &&
      el.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          doLogin();
        }
      })
  );

  if (u && !u.value) u.value = localStorage.getItem("LOGIN_USER") || "";
})();

/* ----------------------------------------- */
/* 9) Wire-up dos controles (idempotente)    */
/* ----------------------------------------- */
function wireUI() {
  // Salvar / Limpar / Atualizar ledgers
  $("saveCfg")?.addEventListener("click", async () => {
    const base = $("BASE_URL")?.value?.trim();
    const tok = $("token")?.value?.trim();
    if (base) localStorage.setItem("BASE_URL", base);
    if (tok) localStorage.setItem("TOKEN", tok);
    showBanner("Config salva.", "ok");
    await fetchLedgers();
  });
  $("clearCfg")?.addEventListener("click", () => {
    localStorage.removeItem("BASE_URL");
    localStorage.removeItem("TOKEN");
    showBanner("Config limpa.", "ok");
  });
  $("reloadLedgers")?.addEventListener("click", async () => {
    await fetchLedgers();
    showBanner("Lista de ledgers atualizada.", "ok");
  });

  // Filtros
  $("aplicar")?.addEventListener("click", () => {
    state.page = 1;
    saveFiltersToLS();
    fetchAndRender();
  });
  $("limpar")?.addEventListener("click", () => {
    if ($("dataIni")) $("dataIni").value = "";
    if ($("dataFim")) $("dataFim").value = "";
    $("tipo").value = "";
    $("pageSize").value = String(10);
    localStorage.setItem(
      "FILTROS",
      JSON.stringify({ dataIni: "", dataFim: "", tipo: "", pageSize: "10" })
    );
    state.page = 1;
    fetchAndRender();
  });

  // Presets
  $("presetHoje")?.addEventListener("click", () => {
    const d = new Date().toISOString().slice(0, 10);
    $("dataIni").value = d;
    $("dataFim").value = d;
    state.page = 1;
    saveFiltersToLS();
    fetchAndRender();
  });
  $("preset7")?.addEventListener("click", () => {
    const e = new Date();
    const s = new Date();
    s.setDate(e.getDate() - 6);
    $("dataIni").value = s.toISOString().slice(0, 10);
    $("dataFim").value = e.toISOString().slice(0, 10);
    state.page = 1;
    saveFiltersToLS();
    fetchAndRender();
  });
  $("preset30")?.addEventListener("click", () => {
    const e = new Date();
    const s = new Date();
    s.setDate(e.getDate() - 29);
    $("dataIni").value = s.toISOString().slice(0, 10);
    $("dataFim").value = e.toISOString().slice(0, 10);
    state.page = 1;
    saveFiltersToLS();
    fetchAndRender();
  });
  $("presetMes")?.addEventListener("click", () => {
    const n = new Date();
    const s = new Date(n.getFullYear(), n.getMonth(), 1);
    const e = new Date(n.getFullYear(), n.getMonth() + 1, 0);
    $("dataIni").value = s.toISOString().slice(0, 10);
    $("dataFim").value = e.toISOString().slice(0, 10);
    state.page = 1;
    saveFiltersToLS();
    fetchAndRender();
  });

  // Page size
  $("pageSize")?.addEventListener("change", () => {
    state.page = 1;
    saveFiltersToLS();
    fetchAndRender();
  });

  // Sort nos cabeçalhos
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (!key) return;
      if (state.sortField === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortField = key;
        state.sortDir = "asc";
      }
      renderSortIndicators();
      state.page = 1;
      fetchAndRender();
    });
  });

  // CSV local/servidor
  // CSV formato (BR/US)
  (function () {
    const csvSel = $("csvStyle");
    if (!csvSel) return;
    csvSel.value = localStorage.getItem("CSV_STYLE") || "br";
    csvSel.addEventListener("change", () => {
      const v = csvSel.value === "us" ? "us" : "br";
      localStorage.setItem("CSV_STYLE", v);
      showBanner(`Formato CSV: ${v.toUpperCase()}`, "ok");
    });
  })();
  $("baixarCSV")?.addEventListener("click", () => baixarCSV("page")); // local (página)
  $("baixarCSVAll")?.addEventListener("click", () => baixarCSV("all")); // servidor (tudo)
  $("btnCsvPagina")?.addEventListener("click", (e) => {
    e.preventDefault();
    openCsv("page");
  });
  $("btnCsvTudo")?.addEventListener("click", (e) => {
    e.preventDefault();
    openCsv("all");
  });

  // Testar conexão
  $("testConn")?.addEventListener("click", (e) => {
    e.preventDefault();
    testConn();
  });
}

/* ----------------------------------------- */
/* 10) Anti-overlay/backdrop e Boot único    */
/* ----------------------------------------- */
function killBackdrops() {
  document.documentElement.classList.remove("modal-open");
  document.body.classList.remove("modal-open");
  document
    .querySelectorAll(
      "#overlay,#loading,.modal-backdrop,.blocker,[class*=overlay],[class*=backdrop]"
    )
    .forEach((el) => {
      el.style.pointerEvents = "none";
      el.style.opacity = "0";
      el.style.zIndex = "-1";
    });
}

async function boot() {
  // defaults da UI por LocalStorage
  if ($("BASE_URL") && !$("BASE_URL").value)
    $("BASE_URL").value = localStorage.getItem("BASE_URL") || "";
  if ($("token") && !$("token").value) $("token").value = localStorage.getItem("TOKEN") || "";

  restoreFiltersFromLS();
  wireUI();
  renderSortIndicators();
  updateTokenTTL();
  scheduleAutoRefresh();
  await fetchLedgers();

  const haveBase = (window.apiBase() || "").length > 0;
  if (haveBase) fetchAndRender();

  killBackdrops();
  setTimeout(killBackdrops, 120);
}

window.addEventListener("error", (ev) => console.error("JS error:", ev.error || ev.message));
window.addEventListener("unhandledrejection", (ev) =>
  console.error("Promise rejection:", ev.reason)
);
document.addEventListener("click", killBackdrops, { capture: true });

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}

/* ============================ Fim do arquivo ============================ */

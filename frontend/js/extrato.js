console.log("extrato.js carregado");

document.addEventListener("DOMContentLoaded", () => {
  const byId = (id) => document.getElementById(id);

  byId("saveCfg")?.addEventListener("click", () => alert("Salvar Config clicado"));
  byId("clearCfg")?.addEventListener("click", () => alert("Limpar Config clicado"));
  byId("aplicar")?.addEventListener("click", () => alert("Aplicar filtros clicado"));
});

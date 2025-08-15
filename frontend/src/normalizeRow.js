/**
 * Normaliza um item de extrato vinda de APIs diversas.
 * Mantém a mesma lógica do app, com duas garantias:
 * - id sempre string
 * - tipo é recalculado após ajustar o sinal (debito/sign)
 */
export function normalizeRow(it) {
  if (!it || typeof it !== "object") return { id: "", data: "", tipo: "", valor: 0, descricao: "" };

  const id = String(it.id ?? it.tx_id ?? it.transaction_id ?? it.uuid ?? it.numero ?? it.seq ?? "");

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

  // Se vier marcado como débito (flag/sign) e o valor for positivo, inverte.
  if ((it.sign === "-" || it.debito === true) && valor > 0) valor = -valor;

  // Define tipo: prioriza o explícito; senão deduz pelo sinal *depois* do ajuste acima.
  let tipo = tipoRaw || (Number(valor) < 0 ? "DEBITO" : "CREDITO");

  const descricao = it.descricao ?? it.description ?? it.memo ?? it.obs ?? it.note ?? "";

  return {
    id,
    data: data && !isNaN(data) ? data.toISOString() : dataRaw || "",
    tipo,
    valor: Number(valor),
    descricao: String(descricao || ""),
  };
}

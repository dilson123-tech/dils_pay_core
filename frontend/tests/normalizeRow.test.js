import { describe, it, expect } from "vitest";
import { normalizeRow } from "../src/normalizeRow.js";

describe("normalizeRow", () => {
  it("mapeia campos padrão", () => {
    const out = normalizeRow({
      id: "A1",
      data: "2025-08-14 03:05:39",
      tipo: "DEBITO",
      valor: -30.5,
      descricao: "Café",
    });
    expect(out.id).toBe("A1");
    expect(out.tipo).toBe("DEBITO");
    expect(out.valor).toBe(-30.5);
    expect(typeof out.data).toBe("string"); // ISO depende do fuso
    expect(out.descricao).toBe("Café");
  });

  it("deduz tipo quando ausente e aceita valor_centavos", () => {
    const out = normalizeRow({
      uuid: "B2",
      created_at: "2025-08-15T10:00:00",
      valor_centavos: 12345, // 123,45
      memo: "Depósito",
    });
    expect(out.id).toBe("B2");
    expect(out.tipo).toBe("CREDITO");
    expect(out.valor).toBe(123.45);
    expect(out.descricao).toBe("Depósito");
  });

  it("conserta separador decimal em string e força débito quando marcado", () => {
    const out = normalizeRow({
      tx_id: "C3",
      date: "2025-08-15 12:00:00",
      amount: "45,90", // vírgula -> ponto
      debito: true,
    });
    expect(out.id).toBe("C3");
    expect(out.tipo).toBe("DEBITO");
    expect(out.valor).toBe(-45.9); // forçou negativo
  });

  it("usa outros aliases de campos e mantém zero quando inválido", () => {
    const out = normalizeRow({
      numero: 77,
      timestamp: "2025-08-15T12:34:56",
      total: "abc", // inválido -> 0
      note: "Teste",
    });
    expect(out.id).toBe("77");
    expect(out.valor).toBe(0);
    expect(out.tipo).toBe("CREDITO"); // 0 não-negativo -> crédito por padrão
    expect(out.descricao).toBe("Teste");
  });

  it("retorna estrutura vazia quando input é inválido", () => {
    const out = normalizeRow(null);
    expect(out).toEqual({ id: "", data: "", tipo: "", valor: 0, descricao: "" });
  });
});

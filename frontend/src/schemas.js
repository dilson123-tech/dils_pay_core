import { z } from "../node_modules/zod/lib/index.mjs";

/** Carteiras (/wallets) — valida presença de algum identificador */
const WalletBase = z
  .object({
    id: z.any().optional(),
    wallet_id: z.any().optional(),
    ledger_id: z.any().optional(),
    user_id: z.any().optional(),
    owner: z.any().optional(),
    saldo: z.any().optional(),
    balance: z.any().optional(),
  })
  .refine(
    (w) => "id" in w || "wallet_id" in w || "ledger_id" in w,
    "Wallet sem identificador (id/wallet_id/ledger_id)"
  );

export const WalletArray = z.array(WalletBase);

/** Linha normalizada do extrato (pós-normalizeRow) */
export const NormalizedRow = z.object({
  id: z.string(),
  data: z.string(), // ISO ou string crua aceitável
  tipo: z.enum(["CREDITO", "DEBITO"]),
  valor: z.number(),
  descricao: z.string(),
});

export const Schemas = { WalletArray, NormalizedRow };
window.Schemas = Schemas; // expõe para extrato.js

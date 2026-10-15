import { z } from "zod"

// Número digitado em pt-BR: aceita "1.234,56", "19,4" e "19.4"
export const decimal = z
  .string()
  .trim()
  .min(1, "Informe o valor.")
  .transform((v, ctx) => {
    const n = Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v)
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "Número inválido." })
      return z.NEVER
    }
    return n
  })

export const texto = (max: number) => z.string().trim().max(max)

// Campo de formulário vazio vira undefined
export const opcional = (v: FormDataEntryValue | null) =>
  v == null || String(v).trim() === "" ? undefined : String(v)

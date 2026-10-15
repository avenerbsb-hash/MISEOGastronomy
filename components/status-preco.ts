// Paleta funcional dos indicadores de preço (filtros e badges de Insumos)
export type StatusPreco = "subiu" | "caiu" | "estavel" | "sem_comparacao" | "sem_preco"

export const CORES_STATUS: Record<StatusPreco, { texto: string; fundo: string }> = {
  subiu: { texto: "#DC2626", fundo: "#FEE2E2" },
  caiu: { texto: "#16A34A", fundo: "#DCFCE7" },
  estavel: { texto: "#64748B", fundo: "#F1F5F9" },
  sem_comparacao: { texto: "#B45309", fundo: "#FEF3C7" },
  sem_preco: { texto: "#EA580C", fundo: "#FFEDD5" },
}

// "Todos" selecionado
export const COR_TODOS = { texto: "#FFFFFF", fundo: "#111111" }

// Situação a partir do sinal calculado pelo banco (verde = caiu, vermelho = subiu)
export function statusDoSinal(sinal: string | null | undefined, pct: number | null | undefined, temPreco = true): StatusPreco {
  if (!temPreco) return "sem_preco"
  if (sinal === "vermelho") return "subiu"
  if (sinal === "verde") return "caiu"
  return pct == null ? "sem_comparacao" : "estavel"
}

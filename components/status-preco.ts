// Paleta funcional (efeito para o negócio): alta de custo = vermelho #EC001C, queda = verde #00843B,
// estável e sem comparação = cinza, sem preço = laranja (pendência)
export type StatusPreco = "subiu" | "caiu" | "estavel" | "sem_comparacao" | "sem_preco"

export const CORES_STATUS: Record<StatusPreco, { texto: string; fundo: string }> = {
  subiu: { texto: "#EC001C", fundo: "#FFE3E7" },
  caiu: { texto: "#00843B", fundo: "#DCF3E5" },
  estavel: { texto: "#5F6B76", fundo: "#EEF1F4" },
  sem_comparacao: { texto: "#5F6B76", fundo: "#EEF1F4" },
  sem_preco: { texto: "#B85C00", fundo: "#FFEBD6" },
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

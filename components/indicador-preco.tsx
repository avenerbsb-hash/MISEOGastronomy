import { CORES_STATUS, type StatusPreco } from "@/components/status-preco"

// Indicadores de preço (0012). Só apresentação: valores e status vêm de indicadores_insumos /
// historico_mensal_insumo, classificados no banco pelos valores completos.

export type StatusIndicador = StatusPreco | "sem_base" | "indisponivel"

// Ausência de histórico comparável = âmbar (mesma cor de "sem comparação")
const COR: Record<StatusIndicador, { texto: string; fundo: string }> = {
  ...CORES_STATUS,
  sem_base: CORES_STATUS.sem_comparacao,
  indisponivel: CORES_STATUS.sem_comparacao,
}

const ROTULO: Record<StatusIndicador, string> = {
  subiu: "Subiu", caiu: "Caiu", estavel: "Estável", sem_comparacao: "Sem comparação", sem_preco: "Sem preço",
  sem_base: "Sem base mensal", indisponivel: "Volatilidade indisponível",
}

// Percentual com as casas decimais necessárias para não mostrar 0,0% numa variação que existe
// (nada de "+<0,1%"): 1 casa; se arredondar para zero, 2, 3… até 4.
export function pctPreciso(v: number, sinal = true): string {
  const n = Number(v)
  let casas = 1
  while (casas < 4 && n !== 0 && Number(Math.abs(n).toFixed(casas)) === 0) casas++
  const texto = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(Math.abs(n))
  return (sinal ? (n > 0 ? "+" : n < 0 ? "−" : "") : "") + texto + "%"
}

export function textoIndicador(status: StatusIndicador, pct: number | null | undefined, tipo: "variacao" | "volatilidade" = "variacao"): string {
  if (tipo === "volatilidade") return status === "indisponivel" || pct == null ? ROTULO.indisponivel : pctPreciso(pct, false)
  if ((status === "subiu" || status === "caiu") && pct != null) return `${status === "subiu" ? "▲" : "▼"} ${pctPreciso(pct)}`
  if (status === "estavel") return "= 0,0%"
  return ROTULO[status]
}

// Selo do indicador; "rotulo" opcional à esquerda (ex.: "Última", "Mês")
export function SeloIndicador({ status, pct, tipo = "variacao", rotulo, titulo }: {
  status: StatusIndicador; pct?: number | null; tipo?: "variacao" | "volatilidade"; rotulo?: string; titulo?: string
}) {
  // volatilidade não é alta nem queda: cinza quando disponível
  const cor = tipo === "volatilidade" && status !== "indisponivel" ? CORES_STATUS.estavel : COR[status]
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
      style={{ color: cor.texto, backgroundColor: cor.fundo }} title={titulo ?? ROTULO[status]}>
      {rotulo ? <span className="font-normal opacity-80">{rotulo}</span> : null}
      {textoIndicador(status, pct, tipo)}
    </span>
  )
}

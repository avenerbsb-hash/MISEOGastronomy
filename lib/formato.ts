// Formatação para exibição: R$, datas dd/mm/aaaa no fuso de São Paulo, unidades.
// Nenhum cálculo de custo aqui: só apresentação de valores que vêm do banco.

export const FUSO = "America/Sao_Paulo"

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 })
const pct1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export type Dimensao = "massa" | "volume" | "contagem"

export function reais(v: number | null | undefined): string {
  return v == null ? "—" : brl.format(Number(v))
}

export function numero(v: number | null | undefined): string {
  return v == null ? "—" : num.format(Number(v))
}

export function percentual(v: number | null | undefined, sinal = false): string {
  if (v == null) return "—"
  const n = Number(v)
  return (sinal && n > 0 ? "+" : "") + pct1.format(n) + "%"
}

// "2026-10-13" → "13/10/2026" (datas sem hora: não passam por fuso)
export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—"
  const [a, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${a}`
}

// timestamptz → "13/10/2026 14:32" em São Paulo
export function dataHora(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso))
}

// Hoje em São Paulo, no formato do <input type="date">
export function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date())
}

// Unidade-base do banco (g / ml / un) e a unidade de exibição de custo (kg / L / un)
export function unidadeExibicao(d: Dimensao | string): string {
  return d === "massa" || d === "g" ? "kg" : d === "volume" || d === "ml" ? "L" : "un"
}

// O banco guarda custo por g, mL ou un; exibimos por kg, L ou un (mudança de escala, não cálculo de custo)
export function custoExibicao(custoBase: number | null | undefined, d: Dimensao | string): number | null {
  if (custoBase == null) return null
  return d === "contagem" || d === "un" ? Number(custoBase) : Number(custoBase) * 1000
}

export function custoPorUnidade(custoBase: number | null | undefined, d: Dimensao | string): string {
  const v = custoExibicao(custoBase, d)
  return v == null ? "—" : `${reais(v)}/${unidadeExibicao(d)}`
}

export const UNIDADES_POR_DIMENSAO: Record<Dimensao, { codigo: string; nome: string }[]> = {
  massa: [{ codigo: "kg", nome: "kg" }, { codigo: "g", nome: "g" }],
  volume: [{ codigo: "l", nome: "L" }, { codigo: "ml", nome: "mL" }],
  contagem: [{ codigo: "un", nome: "un" }],
}

export const NOME_DIMENSAO: Record<Dimensao, string> = {
  massa: "Massa (g, kg)",
  volume: "Volume (mL, L)",
  contagem: "Unidade (un)",
}

export function rotuloUnidade(codigo: string): string {
  return codigo === "l" ? "L" : codigo === "ml" ? "mL" : codigo
}

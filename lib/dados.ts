import "server-only"
import { createClient } from "@/lib/supabase/server"
import type { Dimensao } from "@/lib/formato"

// Leituras compartilhadas. Valores de custo vêm sempre das funções do banco.

export type VariacaoInsumo = {
  insumo_id: string
  insumo: string
  unidade_base: string
  custo_atual: number | null
  custo_anterior: number | null
  variacao_pct: number | null
  sinal: "verde" | "vermelho" | "neutro"
  data_referencia: string | null
}

export type Categoria = { id: string; nome: string; pai_id: string | null }

export type Insumo = {
  id: string
  codigo: string
  nome: string
  dimensao: Dimensao
  categoria_id: string | null
  apresentacao: string | null
  alergenos: string[]
  ativo: boolean
  densidade_g_ml: number | null
  densidade_validada_em: string | null
}

export async function variacoesDaCasa(estab: string): Promise<Map<string, VariacaoInsumo>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("variacoes_insumos", { p_estab: estab })
  if (error) throw error
  return new Map(((data ?? []) as VariacaoInsumo[]).map((v) => [v.insumo_id, v]))
}

// Variação de custo das receitas (ficha final ou subproduto), calculada pelo banco
export type VariacaoReceita = {
  receita_id: string
  nome: string
  custo_atual: number | null
  custo_anterior: number | null
  variacao_pct: number | null
  sinal: "verde" | "vermelho" | "neutro"
  data_referencia: string | null
}

export async function variacoesDasReceitas(estab: string, tipo?: "final" | "subproduto"): Promise<Map<string, VariacaoReceita>> {
  const supabase = await createClient()
  const { data } = await supabase.rpc("variacao_fichas", { p_estab: estab, p_tipo: tipo ?? null })
  return new Map(((data ?? []) as VariacaoReceita[]).map((v) => [v.receita_id, v]))
}

// Histórico de custo de uma receita: uma linha por data em que o custo mudou
export type LinhaHistoricoCusto = {
  data: string
  custo: number
  custo_anterior: number | null
  variacao_pct: number | null
  sinal: "verde" | "vermelho" | "neutro"
  insumos: string
}

export async function historicoCusto(receita: string, estab: string): Promise<LinhaHistoricoCusto[]> {
  const supabase = await createClient()
  const { data } = await supabase.rpc("historico_custo_receita", { p_receita: receita, p_estab: estab })
  return ((data ?? []) as LinhaHistoricoCusto[]).reverse()
}

// Variação de cada componente de uma ficha, na chave "insumo:Nome" / "subproduto:Nome"
export async function variacoesDosComponentes(estab: string): Promise<Map<string, { sinal: string; pct: number | null }>> {
  const [insumos, subprodutos] = await Promise.all([variacoesDaCasa(estab), variacoesDasReceitas(estab, "subproduto")])
  const mapa = new Map<string, { sinal: string; pct: number | null }>()
  for (const v of insumos.values()) mapa.set(`insumo:${v.insumo}`, { sinal: v.sinal, pct: v.variacao_pct })
  for (const v of subprodutos.values()) mapa.set(`subproduto:${v.nome}`, { sinal: v.sinal, pct: v.variacao_pct })
  return mapa
}

// Em ordem de leitura: cada grupo seguido das suas subcategorias ("Bebidas", "Bebidas › Café", …)
export async function categorias(escopo: "insumo" | "receita"): Promise<Categoria[]> {
  const supabase = await createClient()
  const { data } = await supabase.from("categorias").select("id, nome, pai_id").eq("escopo", escopo)
  const lista = (data ?? []) as Categoria[]
  const nomes = nomesCategorias(lista)
  return lista.sort((a, b) => (nomes.get(a.id) ?? "").localeCompare(nomes.get(b.id) ?? "", "pt-BR"))
}

// Nome da categoria com o grupo: "Proteínas e laticínios › Bovino"
export function nomesCategorias(cats: Categoria[]): Map<string, string> {
  const porId = new Map(cats.map((c) => [c.id, c]))
  return new Map(
    cats.map((c) => {
      const pai = c.pai_id ? porId.get(c.pai_id) : null
      return [c.id, pai ? `${pai.nome} › ${c.nome}` : c.nome]
    }),
  )
}

// ------------------------------------------------------------------ alertas de aumento (migração 0008)
// Alta acima de LIMITE_ALERTA % com compra nos últimos DIAS_ALERTA dias
export const LIMITE_ALERTA = 10
export const DIAS_ALERTA = 60

export type AlertaInsumo = {
  insumo_id: string; insumo: string; unidade_base: string
  custo_atual: number; custo_anterior: number; variacao_pct: number; data_referencia: string
  qtd_fichas: number; qtd_subprodutos: number
  receitas: { id: string; nome: string; tipo: "final" | "subproduto" }[]
}

export type AlertaFicha = {
  receita_id: string; nome: string; tipo: "final" | "subproduto"; dimensao: Dimensao
  custo_atual: number; custo_anterior: number; variacao_pct: number; data_referencia: string
  insumos: string | null; preco_venda: number | null; cmv_atual_pct: number | null; cmv_anterior_pct: number | null
}

export async function alertasDaCasa(estab: string, dias = DIAS_ALERTA) {
  const supabase = await createClient()
  const p = { p_estab: estab, p_limite: LIMITE_ALERTA, p_dias: dias }
  const [ins, fic] = await Promise.all([supabase.rpc("alertas_insumos", p), supabase.rpc("alertas_fichas", p)])
  return {
    insumos: (ins.data ?? []) as AlertaInsumo[],
    fichas: (fic.data ?? []) as AlertaFicha[],
    erro: !!(ins.error || fic.error),
  }
}

// Para os avisos nas listas: mesma regra dos alertas, sobre a variação que o banco já calculou
export function emAlerta(v: { variacao_pct: number | null; data_referencia: string | null } | undefined): boolean {
  if (!v || v.variacao_pct == null || !v.data_referencia) return false
  const corte = new Date(Date.now() - DIAS_ALERTA * 864e5).toISOString().slice(0, 10)
  return Number(v.variacao_pct) > LIMITE_ALERTA && v.data_referencia >= corte
}

// ------------------------------------------------------------------ inteligência de preços (migração 0012)
// A = duas últimas compras validadas · B = média ponderada do mês × mês anterior · C = amplitude no mês
export type IndicadorInsumo = {
  insumo_id: string; custo_oficial: number | null; custo_oficial_referencia: boolean
  data_ultima_compra: string | null; ultimo_preco: number | null; preco_anterior: number | null
  variacao_ultima_pct: number | null; status_ultima: "subiu" | "caiu" | "estavel" | "sem_comparacao" | "sem_preco"
  mes: string; mes_encerrado: boolean; media_mes: number | null; media_mes_anterior: number | null
  variacao_mensal_pct: number | null; status_mensal: "subiu" | "caiu" | "estavel" | "sem_base"
  compras_mes: number; volatilidade_pct: number | null; status_volatilidade: "ok" | "indisponivel"
}

// null quando a migração 0012 ainda não foi aplicada (as telas usam a variação antiga)
export async function indicadoresDaCasa(estab: string, mes?: string): Promise<Map<string, IndicadorInsumo> | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("indicadores_insumos", { p_estab: estab, p_mes: mes ?? null })
  if (error) return null
  return new Map(((data ?? []) as IndicadorInsumo[]).map((i) => [i.insumo_id, i]))
}

// "2026-10" → "2026-10-01"; inválido → undefined (mês atual da casa)
export function mesDoParametro(v: string | undefined): string | undefined {
  return v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? `${v}-01` : undefined
}

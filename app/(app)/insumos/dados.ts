import "server-only"
import { createClient } from "@/lib/supabase/server"
import { categorias, indicadoresDaCasa, mesDoParametro, nomesCategorias, variacoesDaCasa, type Insumo, type VariacaoInsumo, visivelNaCasa } from "@/lib/dados"

// Busca, filtro e ordenação da lista de insumos (tela e relatório usam a mesma regra)

export type Situacao = "subiu" | "caiu" | "estavel" | "sem_comparacao" | "sem_preco"
export function situacao(v: VariacaoInsumo | undefined): Situacao {
  if (!v) return "sem_preco"
  if (v.sinal === "vermelho") return "subiu"
  if (v.sinal === "verde") return "caiu"
  return v.custo_anterior == null ? "sem_comparacao" : "estavel"
}

// Base da comparação dos filtros: mês × mês anterior (principal) ou última compra × anterior
export const BASES = {
  mes: { rotulo: "Mês × mês anterior", explica: "média do mês contra a média do mês anterior" },
  compra: { rotulo: "Última × penúltima compra", explica: "última compra validada contra a anterior" },
} as const
export type Base = keyof typeof BASES

export const FILTROS: { valor: "" | Situacao; rotulo: string }[] = [
  { valor: "", rotulo: "Todos" },
  { valor: "subiu", rotulo: "▲ Subiram" },
  { valor: "caiu", rotulo: "▼ Caíram" },
  { valor: "estavel", rotulo: "= Estáveis" },
  { valor: "sem_comparacao", rotulo: "Sem comparação" },
  { valor: "sem_preco", rotulo: "Sem preço" },
]

export const ORDENS = {
  nome: "Nome (A–Z)",
  alta: "Maior alta primeiro",
  queda: "Maior queda primeiro",
} as const
export type Ordem = keyof typeof ORDENS

export type ParamsInsumos = { q?: string; categoria?: string; variacao?: string; ordem?: string; mes?: string; base?: string; uso?: string }
export type LinhaInsumo = Pick<Insumo, "id" | "codigo" | "nome" | "dimensao" | "categoria_id" | "ativo">

// Insumos usados em versões aprovadas (fichas e preparos), em páginas de 1000 linhas
// casaId: só fichas e preparos visíveis na casa (compartilhados ou dela)
export async function insumosEmFichas(casaId?: string): Promise<Set<string>> {
  const supabase = await createClient()
  const ids = new Set<string>()
  for (let de = 0; ; de += 1000) {
    const { data } = await supabase.from("componentes_receita").select("insumo_id, versoes_receita!inner(status, receitas!inner(estabelecimento_id))")
      .eq("versoes_receita.status", "aprovada").not("insumo_id", "is", null).range(de, de + 999)
    for (const c of (data ?? []) as unknown as { insumo_id: string; versoes_receita: { receitas: { estabelecimento_id: string | null } } }[]) {
      if (!casaId || visivelNaCasa(c.versoes_receita?.receitas?.estabelecimento_id, casaId)) ids.add(c.insumo_id)
    }
    if (!data || data.length < 1000) break
  }
  return ids
}

export async function carregarInsumos(casaId: string, params: ParamsInsumos) {
  const { q = "", categoria = "" } = params
  const filtro = FILTROS.some((f) => f.valor === params.variacao) ? (params.variacao as Situacao) : ""
  const ordem: Ordem = params.ordem && params.ordem in ORDENS ? (params.ordem as Ordem) : "nome"
  const base: Base = params.base === "compra" ? "compra" : "mes"
  // "fichas" = só insumos usados em alguma ficha ou preparo aprovado
  const uso = params.uso === "fichas" ? "fichas" : ""
  const supabase = await createClient()

  const cats = await categorias("insumo")
  const nomes = nomesCategorias(cats)

  let consulta = supabase
    .from("insumos")
    .select("id, codigo, nome, dimensao, categoria_id, ativo, estabelecimento_id")
    .order("nome")
  if (q.trim()) {
    const termo = q.trim().replace(/[%,()]/g, " ")
    consulta = consulta.or(`nome.ilike.%${termo}%,codigo.ilike.%${termo}%`)
  }
  if (categoria) {
    // Categoria-mãe inclui as subcategorias
    const ids = [categoria, ...cats.filter((c) => c.pai_id === categoria).map((c) => c.id)]
    consulta = consulta.in("categoria_id", ids)
  }
  const mesISO = mesDoParametro(params.mes)
  const [{ data, error }, variacoes, indicadores, usados] = await Promise.all([
    consulta, variacoesDaCasa(casaId), indicadoresDaCasa(casaId, mesISO),
    uso ? insumosEmFichas(casaId) : Promise.resolve(null),
  ])
  // Situação pela base escolhida (0012); sem a migração, a variação antiga
  const sit = (id: string): Situacao => {
    if (!indicadores) return situacao(variacoes.get(id))
    const ind = indicadores.get(id)
    if (!ind || ind.status_ultima === "sem_preco") return "sem_preco"
    if (base === "compra") return ind.status_ultima
    return ind.status_mensal === "sem_base" ? "sem_comparacao" : ind.status_mensal
  }
  const pctA = (id: string) => (indicadores
    ? (base === "compra" ? indicadores.get(id)?.variacao_ultima_pct : indicadores.get(id)?.variacao_mensal_pct)
    : variacoes.get(id)?.variacao_pct)
  const emFichas = usados
  const todos = ((data ?? []) as (LinhaInsumo & { estabelecimento_id?: string | null })[])
    .filter((i) => visivelNaCasa(i.estabelecimento_id, casaId) && (!emFichas || emFichas.has(i.id)))

  const contagem = new Map<string, number>([["", todos.length]])
  for (const i of todos) {
    const k = sit(i.id)
    contagem.set(k, (contagem.get(k) ?? 0) + 1)
  }
  const insumos = filtro ? todos.filter((i) => sit(i.id) === filtro) : [...todos]

  // Ordenação pela variação que o banco calculou; sem variação vai para o fim
  if (ordem !== "nome") {
    const sentido = ordem === "alta" ? -1 : 1
    insumos.sort((a, b) => {
      const va = pctA(a.id)
      const vb = pctA(b.id)
      if (va == null && vb == null) return a.nome.localeCompare(b.nome, "pt-BR")
      if (va == null) return 1
      if (vb == null) return -1
      return sentido * (Number(va) - Number(vb)) || a.nome.localeCompare(b.nome, "pt-BR")
    })
  }

  return { q, categoria, filtro, ordem, base, uso, cats, nomes, variacoes, indicadores, mes: mesISO?.slice(0, 7) ?? "", sit, todos, insumos, contagem, erro: !!error }
}

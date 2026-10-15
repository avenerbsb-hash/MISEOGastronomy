import "server-only"
import { createClient } from "@/lib/supabase/server"
import { categorias, nomesCategorias, variacoesDaCasa, type Insumo, type VariacaoInsumo } from "@/lib/dados"

// Busca, filtro e ordenação da lista de insumos (tela e relatório usam a mesma regra)

export type Situacao = "subiu" | "caiu" | "estavel" | "sem_comparacao" | "sem_preco"
export function situacao(v: VariacaoInsumo | undefined): Situacao {
  if (!v) return "sem_preco"
  if (v.sinal === "vermelho") return "subiu"
  if (v.sinal === "verde") return "caiu"
  return v.custo_anterior == null ? "sem_comparacao" : "estavel"
}

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

export type ParamsInsumos = { q?: string; categoria?: string; variacao?: string; ordem?: string }
export type LinhaInsumo = Pick<Insumo, "id" | "codigo" | "nome" | "dimensao" | "categoria_id" | "ativo">

export async function carregarInsumos(casaId: string, params: ParamsInsumos) {
  const { q = "", categoria = "" } = params
  const filtro = FILTROS.some((f) => f.valor === params.variacao) ? (params.variacao as Situacao) : ""
  const ordem: Ordem = params.ordem && params.ordem in ORDENS ? (params.ordem as Ordem) : "nome"
  const supabase = await createClient()

  const cats = await categorias("insumo")
  const nomes = nomesCategorias(cats)

  let consulta = supabase
    .from("insumos")
    .select("id, codigo, nome, dimensao, categoria_id, ativo")
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
  const [{ data, error }, variacoes] = await Promise.all([consulta, variacoesDaCasa(casaId)])
  const todos = (data ?? []) as LinhaInsumo[]

  const contagem = new Map<string, number>([["", todos.length]])
  for (const i of todos) {
    const k = situacao(variacoes.get(i.id))
    contagem.set(k, (contagem.get(k) ?? 0) + 1)
  }
  const insumos = filtro ? todos.filter((i) => situacao(variacoes.get(i.id)) === filtro) : [...todos]

  // Ordenação pela variação que o banco calculou; sem variação vai para o fim
  if (ordem !== "nome") {
    const sentido = ordem === "alta" ? -1 : 1
    insumos.sort((a, b) => {
      const va = variacoes.get(a.id)?.variacao_pct
      const vb = variacoes.get(b.id)?.variacao_pct
      if (va == null && vb == null) return a.nome.localeCompare(b.nome, "pt-BR")
      if (va == null) return 1
      if (vb == null) return -1
      return sentido * (Number(va) - Number(vb)) || a.nome.localeCompare(b.nome, "pt-BR")
    })
  }

  return { q, categoria, filtro, ordem, cats, nomes, variacoes, todos, insumos, contagem, erro: !!error }
}

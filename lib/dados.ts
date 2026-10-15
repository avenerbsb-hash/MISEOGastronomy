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

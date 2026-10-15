import "server-only"
import { createClient } from "@/lib/supabase/server"

// Preço publicado, CMV e margem de cada ficha final na casa, pelo painel_cmv (cálculo no banco)
export type PrecoFicha = { preco: number | null; custo: number | null; cmv: number | null; margem: number | null; cardapio: string }

export async function precosDasFichas(casaId: string): Promise<Map<string, PrecoFicha>> {
  const supabase = await createClient()
  const [{ data: painel }, { data: itens }] = await Promise.all([
    supabase.rpc("painel_cmv", { p_estab: casaId }),
    supabase.from("itens_cardapio").select("id, receita_id, cardapios!inner(estabelecimento_id)").eq("cardapios.estabelecimento_id", casaId),
  ])
  const receitaDoItem = new Map((itens ?? []).map((i) => [i.id as string, i.receita_id as string]))
  const mapa = new Map<string, PrecoFicha>()
  for (const l of (painel ?? []) as { item_id: string; cardapio: string; custo_porcao: number | null; preco_publicado: number | null; cmv_atual_pct: number | null; margem_atual: number | null }[]) {
    const r = receitaDoItem.get(l.item_id)
    if (r && !mapa.has(r)) {
      mapa.set(r, { preco: l.preco_publicado, custo: l.custo_porcao, cmv: l.cmv_atual_pct, margem: l.margem_atual, cardapio: l.cardapio })
    }
  }
  return mapa
}

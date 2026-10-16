"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { traduzirErro } from "@/lib/erros"
import { decimal, opcional, texto } from "@/lib/esquemas"
import type { Estado } from "@/components/form-acao"

const esquemaPreco = z.object({
  preco: decimal.pipe(z.number().positive("Informe um preço maior que zero.")),
  motivo: texto(200).optional(),
})

// Novo preço de venda na casa atual. Se a ficha ainda não está no cardápio da casa, entra no "Cardápio".
// O registro do preço é feito pelo banco (aprovar_preco): histórico preservado, custo e CMV gravados.
export async function definirPreco(receitaId: string, _: Estado, dados: FormData): Promise<Estado> {
  const s = await exigirCustos()
  const v = esquemaPreco.safeParse({ preco: dados.get("preco"), motivo: opcional(dados.get("motivo")) })
  if (!v.success) return { erro: v.error.issues[0].message }
  const supabase = await createClient()

  const { data: itens } = await supabase
    .from("itens_cardapio")
    .select("id, cardapios!inner(estabelecimento_id, status)")
    .eq("receita_id", receitaId)
    .eq("cardapios.estabelecimento_id", s.casa.id)
    .neq("cardapios.status", "arquivado")
  let itemId = itens?.[0]?.id as string | undefined

  if (!itemId) {
    let { data: cardapio } = await supabase
      .from("cardapios").select("id").eq("estabelecimento_id", s.casa.id).eq("nome", "Cardápio").maybeSingle()
    if (!cardapio) {
      const novo = await supabase.from("cardapios")
        .insert({ estabelecimento_id: s.casa.id, nome: "Cardápio", status: "publicado" }).select("id").single()
      if (novo.error) return { erro: traduzirErro(novo.error) }
      cardapio = novo.data
    }
    const item = await supabase.from("itens_cardapio").insert({ cardapio_id: cardapio.id, receita_id: receitaId }).select("id").single()
    if (item.error) return { erro: traduzirErro(item.error) }
    itemId = item.data.id as string
  }

  const { error } = await supabase.rpc("aprovar_preco", { p_item: itemId, p_preco: v.data.preco, p_motivo: v.data.motivo ?? null })
  if (error) return { erro: traduzirErro(error) }
  // definir preço de um item desativado o devolve ao cardápio
  await supabase.from("itens_cardapio").update({ ativo: true }).eq("id", itemId).eq("ativo", false)
  revalidatePath("/cmv")
  revalidatePath(`/fichas/${receitaId}`, "layout")
  revalidatePath("/fichas")
  return { ok: "Preço de venda atualizado." }
}

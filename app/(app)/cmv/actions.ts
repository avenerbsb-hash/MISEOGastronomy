"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { traduzirErro } from "@/lib/erros"
import { decimal } from "@/lib/esquemas"
import type { Estado } from "@/components/form-acao"

// Meta de CMV da casa (estabelecimentos.cmv_alvo_padrao): só o administrador central altera
export async function definirMetaCmv(_: Estado, dados: FormData): Promise<Estado> {
  const s = await exigirCustos()
  if (!s.admin) return { erro: "Somente o administrador central altera a meta de CMV." }
  const v = decimal.pipe(z.number().gt(0, "Meta entre 1% e 99%.").lt(100, "Meta entre 1% e 99%.")).safeParse(dados.get("meta"))
  if (!v.success) return { erro: v.error.issues[0].message }
  const supabase = await createClient()
  const { data, error } = await supabase.from("estabelecimentos").update({ cmv_alvo_padrao: v.data }).eq("id", s.casa.id).select("id")
  if (error) return { erro: traduzirErro(error) }
  if (!data?.length) return { erro: "Sem permissão para alterar a meta." }
  revalidatePath("/cmv")
  return { ok: "Meta atualizada." }
}

// Ativa ou desativa o item no cardápio da casa (sai do painel e do CMV médio; histórico de preços preservado)
export async function alternarItemCardapio(itemId: string, ativo: boolean): Promise<Estado> {
  await exigirCustos()
  const supabase = await createClient()
  const { data, error } = await supabase.from("itens_cardapio").update({ ativo }).eq("id", itemId).select("id")
  if (error) return { erro: traduzirErro(error) }
  if (!data?.length) return { erro: "Sem permissão para alterar este item." }
  revalidatePath("/cmv")
  revalidatePath("/fichas", "layout")
  return { ok: ativo ? "Item ativado no cardápio." : "Item desativado do cardápio." }
}

// Move o item para outra seção do cardápio da casa (ou para uma seção nova).
// Seção que já existe em outro cardápio da casa (ex.: "Drinks - Autorais" no cardápio Drinks): o item vai junto
// para esse cardápio e entra no fim da seção. Histórico de preços preservado (o item é o mesmo).
export async function moverItemSecao(itemId: string, _: Estado, dados: FormData): Promise<Estado> {
  const s = await exigirCustos()
  const nova = String(dados.get("nova") ?? "").trim()
  const escolhida = String(dados.get("secao") ?? "").trim()
  const secao = (nova || escolhida).slice(0, 80)
  if (!secao) return { erro: "Escolha a seção ou escreva o nome de uma seção nova." }
  const supabase = await createClient()

  const { data: item } = await supabase.from("itens_cardapio").select("id, cardapio_id, secao").eq("id", itemId).maybeSingle()
  if (!item) return { erro: "Item não encontrado." }
  if (item.secao === secao) return { ok: "O item já está nesta seção." }

  // cardápio onde a seção já existe (na mesma casa) e a última posição dela
  const { data: naSecao } = await supabase.from("itens_cardapio")
    .select("cardapio_id, ordem, cardapios!inner(estabelecimento_id)")
    .eq("cardapios.estabelecimento_id", s.casa.id).eq("secao", secao)
    .order("ordem", { ascending: false }).limit(1)
  const destino = naSecao?.[0] as { cardapio_id: string; ordem: number } | undefined
  const mudanca: { secao: string; cardapio_id?: string; ordem?: number } = { secao }
  if (destino) {
    mudanca.ordem = (destino.ordem ?? 0) + 1
    if (destino.cardapio_id !== item.cardapio_id) mudanca.cardapio_id = destino.cardapio_id
  }
  let { data, error } = await supabase.from("itens_cardapio").update(mudanca).eq("id", itemId).select("id")
  // a mesma ficha já está no cardápio de destino: muda só a seção
  if (error?.code === "23505") ({ data, error } = await supabase.from("itens_cardapio").update({ secao, ordem: mudanca.ordem }).eq("id", itemId).select("id"))
  if (error) return { erro: traduzirErro(error) }
  if (!data?.length) return { erro: "Sem permissão para alterar este item." }
  revalidatePath("/cmv")
  return { ok: `Movido para “${secao}”.` }
}

// Estrutura de custos & taxas da casa (% sobre o preço). Total precisa ficar abaixo de 100%.
const CAMPOS_ESTRUTURA = ["impostos_pct", "cartao_pct", "gorjeta_pct", "ifood_pct", "comissoes_pct", "outras_pct",
  "despesas_fixas_pct", "despesa_financeira_pct", "investimento_lucro_pct"] as const
const pctCampo = decimal.pipe(z.number().min(0, "Percentual não pode ser negativo.").max(99, "Percentual muito alto."))

export async function salvarEstrutura(_: Estado, dados: FormData): Promise<Estado> {
  const s = await exigirCustos()
  const valores: Record<string, number> = {}
  for (const c of CAMPOS_ESTRUTURA) {
    const v = pctCampo.safeParse(dados.get(c) || "0")
    if (!v.success) return { erro: v.error.issues[0].message }
    valores[c] = v.data
  }
  if (Object.values(valores).reduce((t, v) => t + v, 0) >= 100) return { erro: "A soma das deduções precisa ficar abaixo de 100%." }
  const supabase = await createClient()
  const { error } = await supabase.from("estrutura_custos_casa")
    .upsert({ estabelecimento_id: s.casa.id, ...valores, atualizado_em: new Date().toISOString() }, { onConflict: "estabelecimento_id" })
  if (error) return { erro: traduzirErro(error) }
  revalidatePath("/cmv")
  revalidatePath("/fichas", "layout")
  return { ok: "Estrutura de custos salva." }
}

export async function restaurarEstrutura(): Promise<Estado> {
  const s = await exigirCustos()
  const supabase = await createClient()
  const { error } = await supabase.from("estrutura_custos_casa").delete().eq("estabelecimento_id", s.casa.id)
  if (error) return { erro: traduzirErro(error) }
  revalidatePath("/cmv")
  revalidatePath("/fichas", "layout")
  return { ok: "Padrão da planilha restaurado." }
}

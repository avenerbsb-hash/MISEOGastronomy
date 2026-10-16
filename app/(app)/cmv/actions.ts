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

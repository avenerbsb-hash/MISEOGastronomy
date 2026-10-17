"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { exigirCasa, exigirCustos } from "@/lib/sessao"
import { traduzirErro } from "@/lib/erros"
import { decimal, opcional } from "@/lib/esquemas"
import type { Estado } from "@/components/form-acao"

// Contagem: um par depósito/bar por item; em branco = item não contado
export async function registrarContagem(_: Estado, dados: FormData): Promise<Estado> {
  const s = await exigirCasa()
  const itens: { insumo_id: string; deposito: number; bar: number }[] = []
  for (const [k, v] of dados.entries()) {
    const m = /^dep_([0-9a-f-]{36})$/.exec(k)
    if (!m) continue
    const dep = String(v).trim(), bar = String(dados.get(`bar_${m[1]}`) ?? "").trim()
    if (!dep && !bar) continue
    const d = dep ? decimal.safeParse(dep) : { success: true as const, data: 0 }
    const b = bar ? decimal.safeParse(bar) : { success: true as const, data: 0 }
    if (!d.success || !b.success || d.data < 0 || b.data < 0) return { erro: "Use só números (ex.: 3 ou 1,5) na contagem." }
    itens.push({ insumo_id: m[1], deposito: d.data, bar: b.data })
  }
  if (!itens.length) return { erro: "Preencha a contagem de pelo menos um item." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("registrar_contagem", {
    p_estab: s.casa.id, p_itens: itens, p_obs: opcional(dados.get("observacao")) ?? null,
  })
  if (error) return { erro: traduzirErro(error) }
  revalidatePath("/estoque", "layout")
  redirect("/estoque?contagem=ok")
}

const esquemaItem = z.object({
  insumo_id: z.string().uuid("Escolha o insumo."),
  unidade_compra: z.string().trim().min(1, "Informe a unidade de compra (ex.: garrafa).").max(30),
  estoque_minimo: decimal.pipe(z.number().min(0, "O mínimo não pode ser negativo.")),
  conteudo: decimal.pipe(z.number().positive("O conteúdo deve ser maior que zero.")).optional(),
})

// Inclui ou atualiza um item controlado (mínimo, unidade de compra, conteúdo)
export async function salvarItemEstoque(_: Estado, dados: FormData): Promise<Estado> {
  const s = await exigirCustos()
  const v = esquemaItem.safeParse({
    insumo_id: dados.get("insumo_id"), unidade_compra: dados.get("unidade_compra"),
    estoque_minimo: dados.get("estoque_minimo"), conteudo: opcional(dados.get("conteudo")),
  })
  if (!v.success) return { erro: v.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from("estoque_itens").upsert({
    estabelecimento_id: s.casa.id, insumo_id: v.data.insumo_id, unidade_compra: v.data.unidade_compra,
    estoque_minimo: v.data.estoque_minimo, conteudo: v.data.conteudo ?? null, ativo: true, atualizado_em: new Date().toISOString(),
  }, { onConflict: "estabelecimento_id,insumo_id" })
  if (error) return { erro: traduzirErro(error) }
  revalidatePath("/estoque", "layout")
  return { ok: "Item salvo." }
}

// Tira (ou volta) um item do controle; as contagens antigas ficam guardadas
export async function alternarItemEstoque(id: string, ativo: boolean): Promise<Estado> {
  await exigirCustos()
  const supabase = await createClient()
  const { error } = await supabase.from("estoque_itens").update({ ativo, atualizado_em: new Date().toISOString() }).eq("id", id)
  if (error) return { erro: traduzirErro(error) }
  revalidatePath("/estoque", "layout")
  return { ok: ativo ? "Item de volta ao controle." : "Item fora do controle." }
}

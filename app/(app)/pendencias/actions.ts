"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { traduzirErro } from "@/lib/erros"
import { decimal } from "@/lib/esquemas"
import type { Estado } from "@/components/form-acao"

const esquema = z.object({
  quantidade: decimal.pipe(z.number().positive("Informe a quantidade medida.")),
  unidade: z.enum(["g", "kg", "ml", "l", "un"], { message: "Escolha a unidade." }),
})

// Linha de nota de quantidade variável: lança o peso/contagem real medido no recebimento
export async function registrarRecebimento(itemId: string, _: Estado, dados: FormData): Promise<Estado> {
  await exigirCustos()
  const v = esquema.safeParse({ quantidade: dados.get("quantidade"), unidade: dados.get("unidade") })
  if (!v.success) return { erro: v.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.rpc("registrar_recebimento", {
    p_item: itemId, p_quantidade: v.data.quantidade, p_unidade: v.data.unidade,
  })
  if (error) return { erro: traduzirErro(error) }
  revalidatePath("/pendencias")
  revalidatePath("/insumos", "layout")
  return { ok: "Recebimento registrado. Se o preço subiu acima do limite, ele aparece acima para conferência." }
}

// ------------------------------------------------------------------ conferência de compras (0012)
const esquemaConferencia = z.object({
  acao: z.enum(["aprovar", "corrigir", "rejeitar"], { message: "Escolha aprovar, corrigir ou rejeitar." }),
  justificativa: z.string().trim().max(500, "A justificativa pode ter até 500 caracteres.").nullish(),
})
const esquemaCorrecao = z.object({
  quantidade: decimal.pipe(z.number().positive("Informe a quantidade corrigida.")),
  unidade: z.enum(["mg", "g", "kg", "ml", "l", "un"], { message: "Escolha a unidade." }),
  valor: decimal.pipe(z.number().positive("Informe o valor total corrigido.")),
})

export async function resolverConferencia(conferenciaId: string, _: Estado, dados: FormData): Promise<Estado> {
  await exigirCustos()
  const v = esquemaConferencia.safeParse({ acao: dados.get("acao"), justificativa: dados.get("justificativa") })
  if (!v.success) return { erro: v.error.issues[0].message }
  let correcao: z.infer<typeof esquemaCorrecao> | null = null
  if (v.data.acao === "corrigir") {
    const c = esquemaCorrecao.safeParse({ quantidade: dados.get("quantidade"), unidade: dados.get("unidade"), valor: dados.get("valor") })
    if (!c.success) return { erro: c.error.issues[0].message }
    correcao = c.data
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("resolver_conferencia", {
    p_conferencia: conferenciaId, p_acao: v.data.acao, p_justificativa: v.data.justificativa || null,
    p_quantidade: correcao?.quantidade ?? null, p_unidade: correcao?.unidade ?? null, p_valor: correcao?.valor ?? null,
  })
  if (error) return { erro: traduzirErro(error) }
  revalidatePath("/pendencias")
  revalidatePath("/insumos", "layout")
  revalidatePath("/fichas", "layout")
  return { ok: v.data.acao === "aprovar" ? "Compra aprovada: o custo foi atualizado." : v.data.acao === "corrigir" ? "Compra corrigida e validada." : "Compra rejeitada: o custo anterior continua valendo." }
}

// Limite de alta (%) que manda a compra para conferência: geral da casa ou por categoria
const esquemaLimite = z.object({
  categoria_id: z.string().uuid().optional(),
  limite: decimal.pipe(z.number().gt(0, "Limite maior que zero.").lte(9999, "Limite muito alto.")),
})

export async function salvarLimite(_: Estado, dados: FormData): Promise<Estado> {
  const s = await exigirCustos()
  const cat = dados.get("categoria_id")
  const v = esquemaLimite.safeParse({ categoria_id: cat ? String(cat) : undefined, limite: dados.get("limite") })
  if (!v.success) return { erro: v.error.issues[0].message }
  const supabase = await createClient()
  let busca = supabase.from("limites_conferencia_preco").select("id").eq("estabelecimento_id", s.casa.id)
  busca = v.data.categoria_id ? busca.eq("categoria_id", v.data.categoria_id) : busca.is("categoria_id", null)
  const { data: atual } = await busca.maybeSingle()
  const { error } = atual
    ? await supabase.from("limites_conferencia_preco").update({ limite_pct: v.data.limite, atualizado_em: new Date().toISOString() }).eq("id", atual.id)
    : await supabase.from("limites_conferencia_preco").insert({ estabelecimento_id: s.casa.id, categoria_id: v.data.categoria_id ?? null, limite_pct: v.data.limite })
  if (error) return { erro: traduzirErro(error) }
  revalidatePath("/pendencias")
  return { ok: "Limite salvo." }
}

export async function removerLimite(limiteId: string): Promise<Estado> {
  await exigirCustos()
  const supabase = await createClient()
  const { error } = await supabase.from("limites_conferencia_preco").delete().eq("id", limiteId)
  if (error) return { erro: traduzirErro(error) }
  revalidatePath("/pendencias")
  return null
}

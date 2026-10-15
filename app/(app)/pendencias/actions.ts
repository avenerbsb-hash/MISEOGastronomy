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
  return { ok: "Recebimento registrado e preço validado." }
}

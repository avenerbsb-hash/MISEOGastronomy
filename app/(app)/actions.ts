"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { COOKIE_CASA, obterSessao } from "@/lib/sessao"
import { VERSAO_TERMOS } from "@/lib/empresa"
import { traduzirErro } from "@/lib/erros"
import type { Estado } from "@/components/form-acao"

export async function trocarCasa(dados: FormData) {
  const id = String(dados.get("casa") ?? "")
  const s = await obterSessao()
  if (!s.casas.some((c) => c.id === id)) return
  ;(await cookies()).set(COOKIE_CASA, id, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 })
  revalidatePath("/", "layout")
}

export async function sair() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  ;(await cookies()).delete(COOKIE_CASA)
  revalidatePath("/", "layout")
  redirect("/login")
}

// Aceite dos Termos de Uso e da Política de Privacidade (0029)
export async function aceitarTermos(_: Estado, dados: FormData): Promise<Estado> {
  if (dados.get("aceito") !== "on") return { erro: "Marque a caixa para aceitar." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("aceitar_termos", { p_versao: VERSAO_TERMOS })
  if (error) return { erro: traduzirErro(error) }
  revalidatePath("/", "layout")
  return { ok: "Obrigado! Abrindo o sistema…" }
}

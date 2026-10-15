"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { COOKIE_CASA, obterSessao } from "@/lib/sessao"

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
  redirect("/login")
}

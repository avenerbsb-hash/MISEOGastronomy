"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { traduzirErro } from "@/lib/erros"
import { destinoLogin } from "@/lib/destino-login"
import type { Estado } from "@/components/form-acao"

const esquema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
  senha: z.string().min(1, "Informe a senha."),
})

export async function entrar(_: Estado, dados: FormData): Promise<Estado> {
  const v = esquema.safeParse({ email: dados.get("email"), senha: dados.get("senha") })
  if (!v.success) return { erro: v.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email: v.data.email, password: v.data.senha })
  if (error) return { erro: traduzirErro(error) }
  redirect(destinoLogin(dados.get("next")))
}

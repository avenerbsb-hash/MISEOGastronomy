"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient as clienteSemSessao } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { supabaseKey, supabaseUrl } from "@/lib/supabase/env"
import { obterSessao } from "@/lib/sessao"
import { traduzirErro } from "@/lib/erros"
import type { Estado } from "@/components/form-acao"

async function exigirAdmin() {
  const s = await obterSessao()
  if (!s.admin) throw new Error("Só o administrador gerencia usuários.")
  return s
}

const esquemaNovo = z.object({
  nome: z.string().trim().min(2, "Informe o nome."),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  senha: z.string().min(8, "A senha provisória precisa ter pelo menos 8 caracteres."),
  casa: z.string().min(1, "Escolha a casa."),
  nivel: z.coerce.number().int().min(1, "Escolha o nível.").max(4),
})

// Cria o login pelo cadastro oficial do Supabase Auth (sem chave secreta) e define nome e nível
export async function criarUsuario(_: Estado, dados: FormData): Promise<Estado> {
  const s = await exigirAdmin()
  const v = esquemaNovo.safeParse({
    nome: dados.get("nome"), email: dados.get("email"), senha: dados.get("senha"), casa: dados.get("casa"), nivel: dados.get("nivel"),
  })
  if (!v.success) return { erro: v.error.issues[0].message }
  const casas = v.data.casa === "todas" ? s.casas.map((c) => c.id) : [v.data.casa]
  if (!casas.every((id) => s.casas.some((c) => c.id === id))) return { erro: "Casa inválida." }

  // cliente à parte, sem gravar sessão: o administrador continua logado
  const auth = clienteSemSessao(supabaseUrl(), supabaseKey(), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const { data, error } = await auth.auth.signUp({ email: v.data.email, password: v.data.senha, options: { data: { nome: v.data.nome } } })
  if (error) return { erro: error.message.includes("registered") ? "Já existe um login com este e-mail." : `Não foi possível criar o login: ${error.message}` }
  const novo = data.user
  if (!novo || (novo.identities && novo.identities.length === 0)) return { erro: "Já existe um login com este e-mail." }

  const supabase = await createClient()
  const perfil = await supabase.rpc("salvar_perfil_miseo", { p_user: novo.id, p_nome: v.data.nome, p_ativo: true })
  if (perfil.error) return { erro: traduzirErro(perfil.error) }
  for (const casa of casas) {
    const r = await supabase.rpc("definir_acesso_nivel", { p_user: novo.id, p_estab: casa, p_nivel: v.data.nivel })
    if (r.error) return { erro: traduzirErro(r.error) }
  }
  revalidatePath("/usuarios")
  return data.session
    ? { ok: `Login criado para ${v.data.nome}. Ele já pode entrar com ${v.data.email} e a senha provisória.` }
    : { ok: `Login criado para ${v.data.nome}. O Supabase enviou um e-mail de confirmação para ${v.data.email}: depois de confirmar, ele entra com a senha provisória.` }
}

// Nível de cada casa (0 = sem acesso)
export async function salvarNiveis(userId: string, _: Estado, dados: FormData): Promise<Estado> {
  const s = await exigirAdmin()
  const supabase = await createClient()
  for (const c of s.casas) {
    const valor = dados.get(`nivel_${c.id}`)
    if (valor == null) continue
    const nivel = Number(valor)
    if (![0, 1, 2, 3, 4].includes(nivel)) return { erro: "Nível inválido." }
    const r = await supabase.rpc("definir_acesso_nivel", { p_user: userId, p_estab: c.id, p_nivel: nivel })
    if (r.error) return { erro: traduzirErro(r.error) }
  }
  revalidatePath("/usuarios")
  return { ok: "Acessos salvos." }
}

// Ativar / desativar (desativado não entra em nenhuma casa; nada é apagado)
export async function alternarUsuario(userId: string, nome: string, ativo: boolean): Promise<Estado> {
  await exigirAdmin()
  const supabase = await createClient()
  const { error } = await supabase.rpc("salvar_perfil_miseo", { p_user: userId, p_nome: nome, p_ativo: ativo })
  if (error) return { erro: traduzirErro(error) }
  revalidatePath("/usuarios")
  return { ok: ativo ? "Usuário ativado." : "Usuário desativado." }
}

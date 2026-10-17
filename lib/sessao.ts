import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export type Papel = "admin" | "gestor" | "producao" | "estoquista" | "contagem"
export type Casa = { id: string; nome: string; papel: Papel }
export type Sessao = {
  userId: string
  email: string
  nome: string
  admin: boolean
  casas: Casa[]
  casa: Casa | null        // casa selecionada no topo
  papel: Papel | null      // papel na casa selecionada
}

export const COOKIE_CASA = "miseo_casa"

// Lê usuário, perfil e acessos uma vez por requisição
export const obterSessao = cache(async (): Promise<Sessao> => {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) redirect("/login")

  const { data: perfil } = await supabase
    .from("perfis").select("nome, admin, ativo").eq("user_id", user.id).maybeSingle()

  const admin = !!(perfil?.admin && perfil?.ativo)
  let casas: Casa[] = []
  if (perfil?.ativo) {
    if (admin) {
      const { data } = await supabase.from("estabelecimentos").select("id, nome").eq("ativo", true).order("nome")
      casas = (data ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string, papel: "admin" as const }))
    } else {
      const { data } = await supabase
        .from("acessos_estabelecimento")
        .select("papel, estabelecimentos(id, nome)")
        .eq("user_id", user.id)
      casas = (data ?? [])
        .map((a) => {
          const e = a.estabelecimentos as unknown as { id: string; nome: string } | null
          return e ? { id: e.id, nome: e.nome, papel: a.papel as Papel } : null
        })
        .filter((c): c is Casa => c !== null)
        .sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"))
    }
  }

  const escolhida = (await cookies()).get(COOKIE_CASA)?.value
  const casa = casas.find((c) => c.id === escolhida) ?? casas[0] ?? null

  return {
    userId: user.id,
    email: user.email ?? "",
    nome: (perfil?.nome as string | undefined) ?? user.email ?? "",
    admin,
    casas,
    casa,
    papel: casa?.papel ?? null,
  }
})

export function podeVerCustos(s: Sessao): boolean {
  return s.papel === "admin" || s.papel === "gestor"
}

// Para páginas com valores em R$: produção é mandada para a ficha de produção
export async function exigirCustos(): Promise<Sessao & { casa: Casa }> {
  const s = await obterSessao()
  if (!s.casa) redirect("/sem-acesso")
  if (!podeVerCustos(s)) redirect(inicioDoPapel(s))
  return s as Sessao & { casa: Casa }
}

// Tela inicial de cada papel: contagem só conta; estoquista vê o pedido e conta
export function inicioDoPapel(s: Sessao): string {
  if (s.papel === "contagem") return "/estoque/contagem"
  if (s.papel === "estoquista") return "/estoque"
  return podeVerCustos(s) ? "/inicio" : "/subprodutos"
}

// Fichas e preparos: quem é só do estoque volta para a sua tela
export async function exigirProducao(): Promise<Sessao & { casa: Casa }> {
  const s = await obterSessao()
  if (!s.casa) redirect("/sem-acesso")
  if (s.papel === "contagem" || s.papel === "estoquista") redirect(inicioDoPapel(s))
  return s as Sessao & { casa: Casa }
}

export async function exigirCasa(): Promise<Sessao & { casa: Casa }> {
  const s = await obterSessao()
  if (!s.casa) redirect("/sem-acesso")
  return s as Sessao & { casa: Casa }
}

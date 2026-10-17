"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { COOKIE_CASA, obterSessao } from "@/lib/sessao"
import { traduzirErro } from "@/lib/erros"
import type { Estado } from "@/components/form-acao"

async function exigirAdmin() {
  const s = await obterSessao()
  if (!s.admin) throw new Error("Só o administrador gerencia as casas.")
  return s
}

const naoMigrado = (m: string) => m.includes("Could not find the function") || m.includes("does not exist")
const meta = z.string().trim().transform((v) => Number(v.replace(",", ".")))
  .pipe(z.number({ error: "Meta de CMV inválida." }).gt(0, "A meta de CMV deve ser maior que 0%.").lt(100, "A meta de CMV deve ser menor que 100%."))

const esquemaNova = z.object({
  nome: z.string().trim().min(2, "Informe o nome da casa."),
  marca: z.string().trim().max(80).optional(),
  meta,
  regra: z.enum(["centavos", "x90", "inteiro", "multiplo_050"]),
  precos_de: z.string().optional(),
  cardapio_de: z.string().optional(),
})

// Nova casa (0028): já fica escolhida no topo para começar a configurar
export async function criarCasa(_: Estado, dados: FormData): Promise<Estado> {
  await exigirAdmin()
  const v = esquemaNova.safeParse(Object.fromEntries(dados))
  if (!v.success) return { erro: v.error.issues[0].message }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("criar_casa", {
    p_nome: v.data.nome, p_marca: v.data.marca || null, p_cmv_alvo: v.data.meta, p_regra: v.data.regra,
    p_precos_de: v.data.precos_de || null, p_cardapio_de: v.data.cardapio_de || null,
  })
  if (error) return { erro: naoMigrado(error.message) ? "O cadastro de casas ainda não está ativo (migração 0028)." : traduzirErro(error) }
  ;(await cookies()).set(COOKIE_CASA, String(data), { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 })
  revalidatePath("/", "layout")
  return { ok: `Casa "${v.data.nome}" criada e já escolhida no topo. Agora dê acesso às pessoas em Usuários e importe as notas em Compras.` }
}

const esquemaEditar = z.object({
  id: z.string().uuid(),
  nome: z.string().trim().min(2, "Informe o nome da casa."),
  marca: z.string().trim().max(80).optional(),
})

export async function editarCasa(_: Estado, dados: FormData): Promise<Estado> {
  await exigirAdmin()
  const v = esquemaEditar.safeParse(Object.fromEntries(dados))
  if (!v.success) return { erro: v.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.rpc("atualizar_casa", { p_estab: v.data.id, p_nome: v.data.nome, p_marca: v.data.marca || null, p_ativo: null })
  if (error) return { erro: traduzirErro(error) }
  revalidatePath("/", "layout")
  return { ok: "Casa atualizada." }
}

// Desativar não apaga nada: a casa some das listas e pode ser reativada aqui
export async function alternarCasa(dados: FormData) {
  await exigirAdmin()
  const id = String(dados.get("id") ?? "")
  const supabase = await createClient()
  const { data: casa } = await supabase.from("estabelecimentos").select("nome, marca, ativo").eq("id", id).maybeSingle()
  if (!casa) return
  await supabase.rpc("atualizar_casa", { p_estab: id, p_nome: casa.nome, p_marca: casa.marca, p_ativo: !casa.ativo })
  revalidatePath("/", "layout")
}

// Dados da casa (gestor): meta de CMV e arredondamento dos preços sugeridos
export async function salvarParametros(_: Estado, dados: FormData): Promise<Estado> {
  const s = await obterSessao()
  if (!s.casa || !(s.admin || s.papel === "gestor")) return { erro: "Só o gestor ou o administrador muda estes dados." }
  const v = z.object({ meta, regra: z.enum(["centavos", "x90", "inteiro", "multiplo_050"]) }).safeParse(Object.fromEntries(dados))
  if (!v.success) return { erro: v.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.rpc("definir_parametros_casa", { p_estab: s.casa.id, p_cmv_alvo: v.data.meta, p_regra: v.data.regra })
  if (error) return { erro: naoMigrado(error.message) ? "Esta opção ainda não está ativa (migração 0028)." : traduzirErro(error) }
  revalidatePath("/", "layout")
  return { ok: "Meta e arredondamento salvos. CMV, alertas e preços sugeridos já usam os valores novos." }
}

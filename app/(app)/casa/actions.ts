"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { traduzirErro } from "@/lib/erros"
import type { Estado } from "@/components/form-acao"

const TIPOS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }
const LIMITE = 2 * 1024 * 1024

// Envia a logo da casa para o Storage (pasta da casa) e grava o endereço público
export async function enviarLogo(_: Estado, dados: FormData): Promise<Estado> {
  const s = await exigirCustos()
  const arquivo = dados.get("logo")
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha a imagem da logo." }
  const ext = TIPOS[arquivo.type]
  if (!ext) return { erro: "Use uma imagem PNG, JPG ou WEBP." }
  if (arquivo.size > LIMITE) return { erro: "A imagem deve ter até 2 MB." }
  const supabase = await createClient()
  const caminho = `${s.casa.id}/logo-${Date.now()}.${ext}`
  const { error: erroEnvio } = await supabase.storage.from("logos").upload(caminho, arquivo, { contentType: arquivo.type, upsert: false })
  if (erroEnvio) return { erro: erroEnvio.message.includes("Bucket not found") ? "O armazenamento de logos ainda não está ativo (migração 0021)." : `Não foi possível enviar a imagem: ${erroEnvio.message}` }
  const { data } = supabase.storage.from("logos").getPublicUrl(caminho)
  const { error } = await supabase.rpc("definir_logo_casa", { p_estab: s.casa.id, p_url: data.publicUrl })
  if (error) return { erro: traduzirErro(error) }
  // apaga as logos antigas desta casa (fica só a nova)
  const { data: antigos } = await supabase.storage.from("logos").list(s.casa.id)
  const remover = (antigos ?? []).map((a) => `${s.casa.id}/${a.name}`).filter((p) => p !== caminho)
  if (remover.length) await supabase.storage.from("logos").remove(remover)
  revalidatePath("/", "layout")
  return { ok: "Logo atualizada. Ela aparece no topo do sistema e nos PDFs desta casa." }
}

export async function removerLogo(): Promise<Estado> {
  const s = await exigirCustos()
  const supabase = await createClient()
  const { error } = await supabase.rpc("definir_logo_casa", { p_estab: s.casa.id, p_url: null })
  if (error) return { erro: traduzirErro(error) }
  const { data: antigos } = await supabase.storage.from("logos").list(s.casa.id)
  if (antigos?.length) await supabase.storage.from("logos").remove(antigos.map((a) => `${s.casa.id}/${a.name}`))
  revalidatePath("/", "layout")
  return { ok: "Logo removida." }
}

// Limites de alerta das fichas por grupo (0026); "Voltar ao padrão" apaga o ajuste da casa
export async function salvarLimites(_: Estado, dados: FormData): Promise<Estado> {
  const s = await exigirCustos()
  const grupo = String(dados.get("grupo") ?? "")
  if (!["drinks", "comida", "bebidas", "outros"].includes(grupo)) return { erro: "Grupo inválido." }
  const padrao = dados.get("acao") === "padrao"
  const n = (k: string) => {
    const v = Number(String(dados.get(k) ?? "").replace(",", "."))
    return Number.isFinite(v) && v > 0 ? v : null
  }
  const valores = { atencao: n("atencao"), alerta: n("alerta"), critico: n("critico"), cmv_atencao: n("cmv_atencao"), cmv_critico: n("cmv_critico") }
  if (!padrao && Object.values(valores).some((v) => v == null)) return { erro: "Preencha todos os limites com números maiores que zero." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("definir_limites_alerta", {
    p_estab: s.casa.id, p_grupo: grupo,
    p_atencao: padrao ? null : valores.atencao, p_alerta: padrao ? null : valores.alerta, p_critico: padrao ? null : valores.critico,
    p_cmv_atencao: padrao ? null : valores.cmv_atencao, p_cmv_critico: padrao ? null : valores.cmv_critico,
  })
  if (error) return { erro: error.message.includes("Could not find") ? "Os limites de alerta ainda não estão ativos (migração 0026)." : traduzirErro(error) }
  revalidatePath("/casa")
  revalidatePath("/alertas")
  revalidatePath("/inicio")
  return { ok: padrao ? "Limites voltaram ao padrão." : "Limites salvos. Os alertas já usam os valores novos." }
}

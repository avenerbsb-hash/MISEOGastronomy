"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { exigirCasa, exigirCustos } from "@/lib/sessao"
import { traduzirErro } from "@/lib/erros"
import { decimal, opcional, texto } from "@/lib/esquemas"
import type { Estado } from "@/components/form-acao"

const unidade = z.enum(["mg", "g", "kg", "ml", "l", "un"], { message: "Escolha a unidade." })
const positivo = (msg: string) => decimal.pipe(z.number().positive(msg))
const UNIDADE_BASE = { massa: "g", volume: "ml", contagem: "un" } as const

// As telas de rascunho e versões servem subprodutos e fichas finais
function revalidarReceita(receitaId: string) {
  revalidatePath(`/subprodutos/${receitaId}`, "layout")
  revalidatePath(`/fichas/${receitaId}`, "layout")
  revalidatePath("/fichas")
}

// ------------------------------------------------------------------ novo subproduto (receita + versão 1 em rascunho)
const esquemaNovo = z.object({
  codigo: texto(30).min(1, "Informe o código."),
  nome: texto(120).min(2, "Informe o nome."),
  categoria_id: z.string().uuid().optional(),
  dimensao_saida: z.enum(["massa", "volume", "contagem"], { message: "Escolha como o rendimento é medido." }),
  rendimento_quantidade: positivo("Informe o rendimento."),
  rendimento_unidade: unidade,
})

export async function criarSubproduto(_: Estado, dados: FormData): Promise<Estado> {
  await exigirCustos()
  const v = esquemaNovo.safeParse({
    codigo: dados.get("codigo"),
    nome: dados.get("nome"),
    categoria_id: opcional(dados.get("categoria_id")),
    dimensao_saida: dados.get("dimensao_saida"),
    rendimento_quantidade: dados.get("rendimento_quantidade"),
    rendimento_unidade: dados.get("rendimento_unidade"),
  })
  if (!v.success) return { erro: v.error.issues[0].message }
  const DIM_UNIDADE: Record<string, string> = { mg: "massa", g: "massa", kg: "massa", ml: "volume", l: "volume", un: "contagem" }
  if (DIM_UNIDADE[v.data.rendimento_unidade] !== v.data.dimensao_saida) {
    return { erro: "A unidade do rendimento precisa combinar com a medida escolhida (massa: g/kg; volume: mL/L; unidade: un)." }
  }
  const supabase = await createClient()
  const { data: receita, error } = await supabase
    .from("receitas")
    .insert({
      codigo: v.data.codigo.toUpperCase(), nome: v.data.nome, tipo: "subproduto",
      categoria_id: v.data.categoria_id ?? null, dimensao_saida: v.data.dimensao_saida,
    })
    .select("id").single()
  if (error) return { erro: traduzirErro(error) }
  // A primeira versão é criada aqui (nova_versao do banco usaria "un" como rendimento padrão)
  const { error: e2 } = await supabase.from("versoes_receita").insert({
    receita_id: receita.id, numero: 1,
    rendimento_quantidade: v.data.rendimento_quantidade, rendimento_unidade: v.data.rendimento_unidade,
  })
  if (e2) return { erro: traduzirErro(e2) }
  revalidatePath("/subprodutos")
  redirect(`/subprodutos/${receita.id}/rascunho`)
}

// ------------------------------------------------------------------ rascunho
export async function criarRascunho(receitaId: string): Promise<Estado> {
  await exigirCustos()
  const supabase = await createClient()
  const { data: versoes } = await supabase
    .from("versoes_receita").select("numero, status").eq("receita_id", receitaId)
  const temVigente = (versoes ?? []).some((x) => x.status === "aprovada")
  if (temVigente) {
    // Copia composição e rendimento da versão vigente
    const { error } = await supabase.rpc("nova_versao", { p_receita: receitaId })
    if (error) return { erro: traduzirErro(error) }
  } else {
    const { data: r } = await supabase.from("receitas").select("dimensao_saida").eq("id", receitaId).single()
    const numero = Math.max(0, ...(versoes ?? []).map((x) => x.numero as number)) + 1
    const { error } = await supabase.from("versoes_receita").insert({
      receita_id: receitaId, numero, rendimento_quantidade: 1,
      rendimento_unidade: UNIDADE_BASE[(r?.dimensao_saida ?? "massa") as keyof typeof UNIDADE_BASE],
    })
    if (error) return { erro: traduzirErro(error) }
  }
  revalidarReceita(receitaId)
  return { ok: "Rascunho criado." }
}

const esquemaRascunho = z.object({
  rendimento_quantidade: positivo("Informe o rendimento."),
  rendimento_unidade: unidade,
  porcao_descricao: texto(200).optional(),
  modo_preparo: texto(5000).optional(),
  validade_horas: decimal.pipe(z.number().int("Validade em horas inteiras.").positive()).optional(),
  observacoes: texto(1000).optional(),
})

export async function salvarRascunho(versaoId: string, receitaId: string, _: Estado, dados: FormData): Promise<Estado> {
  await exigirCustos()
  const v = esquemaRascunho.safeParse({
    rendimento_quantidade: dados.get("rendimento_quantidade"),
    rendimento_unidade: dados.get("rendimento_unidade"),
    porcao_descricao: opcional(dados.get("porcao_descricao")),
    modo_preparo: opcional(dados.get("modo_preparo")),
    validade_horas: opcional(dados.get("validade_horas")),
    observacoes: opcional(dados.get("observacoes")),
  })
  if (!v.success) return { erro: v.error.issues[0].message }
  const supabase = await createClient()
  const { data, error } = await supabase.from("versoes_receita").update({
    rendimento_quantidade: v.data.rendimento_quantidade,
    rendimento_unidade: v.data.rendimento_unidade,
    porcao_descricao: v.data.porcao_descricao ?? null,
    modo_preparo: v.data.modo_preparo ?? null,
    validade_horas: v.data.validade_horas ?? null,
    observacoes: v.data.observacoes ?? null,
  }).eq("id", versaoId).eq("status", "rascunho").select("id")
  if (error) return { erro: traduzirErro(error) }
  if (!data?.length) return { erro: "Este rascunho já foi aprovado ou não existe mais. Recarregue a página." }
  revalidarReceita(receitaId)
  return { ok: "Rascunho salvo." }
}

const esquemaComponente = z.object({
  item: z.string().regex(/^(insumo|subproduto):[0-9a-f-]{36}$/, "Escolha o insumo ou subproduto."),
  etapa: texto(60).optional(),
  quantidade: positivo("Informe a quantidade."),
  unidade,
  observacao: texto(200).optional(),
})

export async function adicionarComponente(versaoId: string, receitaId: string, _: Estado, dados: FormData): Promise<Estado> {
  await exigirCustos()
  const v = esquemaComponente.safeParse({
    item: dados.get("item"),
    etapa: opcional(dados.get("etapa")),
    quantidade: dados.get("quantidade"),
    unidade: dados.get("unidade"),
    observacao: opcional(dados.get("observacao")),
  })
  if (!v.success) return { erro: v.error.issues[0].message }
  const [tipo, itemId] = v.data.item.split(":")
  const supabase = await createClient()
  const { data: ultimo } = await supabase
    .from("componentes_receita").select("ordem").eq("versao_id", versaoId)
    .order("ordem", { ascending: false }).limit(1).maybeSingle()
  const { error } = await supabase.from("componentes_receita").insert({
    versao_id: versaoId,
    ordem: ((ultimo?.ordem as number | undefined) ?? 0) + 1,
    etapa: v.data.etapa ?? null,
    insumo_id: tipo === "insumo" ? itemId : null,
    subproduto_id: tipo === "subproduto" ? itemId : null,
    quantidade: v.data.quantidade,
    unidade: v.data.unidade,
    observacao: v.data.observacao ?? null,
  })
  if (error) return { erro: traduzirErro(error) }
  revalidarReceita(receitaId)
  return { ok: "Componente adicionado." }
}

export async function removerComponente(componenteId: string, receitaId: string): Promise<Estado> {
  await exigirCustos()
  const supabase = await createClient()
  const { error } = await supabase.from("componentes_receita").delete().eq("id", componenteId)
  if (error) return { erro: traduzirErro(error) }
  revalidarReceita(receitaId)
  return null
}

export async function aprovarVersao(versaoId: string, receitaId: string, _: Estado, dados: FormData): Promise<Estado> {
  const s = await exigirCustos()
  if (!s.admin) return { erro: "Somente o administrador central aprova versões." }
  const motivo = opcional(dados.get("motivo"))
  const supabase = await createClient()
  const { error } = await supabase.rpc("aprovar_versao", { p_versao: versaoId, p_motivo: motivo ?? null })
  if (error) return { erro: traduzirErro(error) }
  revalidatePath("/subprodutos", "layout")
  revalidarReceita(receitaId)
  const { data: r } = await supabase.from("receitas").select("tipo").eq("id", receitaId).single()
  redirect(r?.tipo === "final" ? `/fichas/${receitaId}` : `/subprodutos/${receitaId}`)
}

// ------------------------------------------------------------------ lote de produção (equipe da casa)
const esquemaLote = z.object({
  fator_escala: positivo("O fator de escala deve ser maior que zero."),
  quantidade_obtida: decimal.pipe(z.number().min(0, "A quantidade não pode ser negativa.")),
  unidade,
  perdas_descricao: texto(300).optional(),
  observacoes: texto(500).optional(),
})

export async function registrarLote(versaoId: string, receitaId: string, _: Estado, dados: FormData): Promise<Estado> {
  const s = await exigirCasa()
  const v = esquemaLote.safeParse({
    fator_escala: dados.get("fator_escala") || "1",
    quantidade_obtida: dados.get("quantidade_obtida"),
    unidade: dados.get("unidade"),
    perdas_descricao: opcional(dados.get("perdas_descricao")),
    observacoes: opcional(dados.get("observacoes")),
  })
  if (!v.success) return { erro: v.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from("lotes_producao").insert({
    versao_id: versaoId,
    estabelecimento_id: s.casa.id,
    fator_escala: v.data.fator_escala,
    quantidade_obtida: v.data.quantidade_obtida,
    unidade: v.data.unidade,
    perdas_descricao: v.data.perdas_descricao ?? null,
    observacoes: v.data.observacoes ?? null,
  })
  if (error) return { erro: traduzirErro(error) }
  revalidatePath(`/subprodutos/${receitaId}/lotes`)
  return { ok: "Lote registrado." }
}

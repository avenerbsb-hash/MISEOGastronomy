"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { traduzirErro } from "@/lib/erros"
import { UNIDADES_POR_DIMENSAO, type Dimensao } from "@/lib/formato"
import type { Estado } from "@/components/form-acao"

import { decimal, opcional, texto } from "@/lib/esquemas"

// ------------------------------------------------------------------ cadastro / edição
const esquemaInsumo = z.object({
  codigo: texto(30).min(1, "Informe o código."),
  nome: texto(120).min(2, "Informe o nome."),
  categoria_id: z.string().uuid().optional(),
  dimensao: z.enum(["massa", "volume", "contagem"], { message: "Escolha como o insumo é medido." }),
  apresentacao: texto(200).optional(),
  alergenos: texto(300).optional(),
  ativo: z.boolean(),
  densidade: decimal.pipe(z.number().positive("A densidade deve ser maior que zero.")).optional(),
  validar_densidade: z.boolean(),
})

export async function salvarInsumo(id: string | null, _: Estado, dados: FormData): Promise<Estado> {
  const s = await exigirCustos()
  const v = esquemaInsumo.safeParse({
    codigo: dados.get("codigo"),
    nome: dados.get("nome"),
    categoria_id: opcional(dados.get("categoria_id")),
    dimensao: dados.get("dimensao"),
    apresentacao: opcional(dados.get("apresentacao")),
    alergenos: opcional(dados.get("alergenos")),
    ativo: dados.get("ativo") === "on",
    densidade: opcional(dados.get("densidade")),
    validar_densidade: dados.get("validar_densidade") === "on",
  })
  if (!v.success) return { erro: v.error.issues[0].message }

  const registro: Record<string, unknown> = {
    codigo: v.data.codigo.toUpperCase(),
    nome: v.data.nome,
    categoria_id: v.data.categoria_id ?? null,
    dimensao: v.data.dimensao,
    apresentacao: v.data.apresentacao ?? null,
    alergenos: (v.data.alergenos ?? "").split(",").map((a) => a.trim()).filter(Boolean),
    ativo: v.data.ativo,
  }
  // Densidade: só o admin altera/valida (o banco também bloqueia)
  const supabase = await createClient()
  if (s.admin) {
    const densidade = v.data.densidade ?? null
    let validadaEm: string | null = densidade && v.data.validar_densidade ? new Date().toISOString() : null
    if (id && validadaEm) {
      const { data: atual } = await supabase
        .from("insumos").select("densidade_g_ml, densidade_validada_em").eq("id", id).single()
      if (atual?.densidade_validada_em && Number(atual.densidade_g_ml) === densidade) validadaEm = atual.densidade_validada_em
    }
    registro.densidade_g_ml = densidade
    registro.densidade_validada_em = validadaEm
  }

  const r = id
    ? await supabase.from("insumos").update(registro).eq("id", id).select("id").single()
    : await supabase.from("insumos").insert(registro).select("id").single()
  if (r.error) return { erro: traduzirErro(r.error) }
  revalidatePath("/insumos")
  redirect(`/insumos/${r.data.id}`)
}

// ------------------------------------------------------------------ registrar compra (pendente)
const esquemaCompra = z.object({
  data_compra: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data da compra."),
  fornecedor_id: z.string().uuid().optional(),
  quantidade: decimal.pipe(z.number().positive("A quantidade deve ser maior que zero.")),
  unidade: z.string().min(1, "Escolha a unidade."),
  valor_total: decimal.pipe(z.number().min(0, "O valor não pode ser negativo.")),
  documento_ref: texto(60).optional(),
  observacao: texto(300).optional(),
})

export async function registrarCompra(insumoId: string, _: Estado, dados: FormData): Promise<Estado> {
  const s = await exigirCustos()
  const v = esquemaCompra.safeParse({
    data_compra: dados.get("data_compra"),
    fornecedor_id: opcional(dados.get("fornecedor_id")),
    quantidade: dados.get("quantidade"),
    unidade: dados.get("unidade"),
    valor_total: dados.get("valor_total"),
    documento_ref: opcional(dados.get("documento_ref")),
    observacao: opcional(dados.get("observacao")),
  })
  if (!v.success) return { erro: v.error.issues[0].message }

  const supabase = await createClient()
  const { data: insumo } = await supabase.from("insumos").select("dimensao").eq("id", insumoId).single()
  if (!insumo) return { erro: "Insumo não encontrado." }

  // Só unidades da mesma medida do insumo: nada de "caixa" ou "peça" com conversão automática
  const permitidas = UNIDADES_POR_DIMENSAO[insumo.dimensao as Dimensao].map((u) => u.codigo)
  if (!permitidas.includes(v.data.unidade)) {
    return { erro: `Este insumo é medido em ${permitidas.join(" ou ")}. Informe a quantidade pesada ou contada nessa unidade.` }
  }

  const { error } = await supabase.from("historico_precos").insert({
    insumo_id: insumoId,
    estabelecimento_id: s.casa.id,
    fornecedor_id: v.data.fornecedor_id ?? null,
    data_compra: v.data.data_compra,
    quantidade: v.data.quantidade,
    unidade: v.data.unidade,
    valor_total: v.data.valor_total,
    fonte: "manual",
    status: "pendente",
    documento_ref: v.data.documento_ref ?? null,
    observacao: v.data.observacao ?? null,
  })
  if (error) return { erro: traduzirErro(error) }
  revalidatePath(`/insumos/${insumoId}`)
  revalidatePath("/pendencias")
  return { ok: "Compra registrada como pendente. Um gestor precisa validar para o custo mudar." }
}

// ------------------------------------------------------------------ validar / rejeitar
export async function validarPreco(registroId: string, _: Estado, dados: FormData): Promise<Estado> {
  await exigirCustos()
  const aprovar = dados.get("decisao") === "validar"
  const obs = opcional(dados.get("obs"))
  const supabase = await createClient()
  const { error } = await supabase.rpc("validar_preco", { p_registro: registroId, p_aprovar: aprovar, p_obs: obs ?? null })
  if (error) return { erro: traduzirErro(error) }
  revalidatePath("/insumos", "layout")
  revalidatePath("/pendencias")
  return { ok: aprovar ? "Preço validado." : "Preço rejeitado." }
}

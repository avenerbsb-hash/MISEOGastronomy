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

// ------------------------------------------------------------------ excluir (só se nunca foi usado)
export async function excluirInsumo(id: string, _: Estado, dados: FormData): Promise<Estado> {
  await exigirCustos()
  if (dados.get("confirmar") !== "on") return { erro: "Marque a confirmação para excluir." }
  const supabase = await createClient()
  const { data, error } = await supabase.from("insumos").delete().eq("id", id).select("id")
  if (error) {
    return {
      erro: error.code === "23503"
        ? "Este insumo já tem preços, notas ou fichas e não pode ser excluído (o histórico é preservado). Desmarque “Ativo” acima para tirá-lo das listas."
        : traduzirErro(error),
    }
  }
  if (!data?.length) return { erro: "Não foi possível excluir: sem permissão ou o insumo já não existe." }
  revalidatePath("/insumos")
  redirect("/insumos")
}

// ------------------------------------------------------------------ cadastro rápido (de dentro do rascunho)
export type InsumoNovo = { id: string; nome: string; dimensao: Dimensao }
export type EstadoNovoInsumo = { erro?: string; novo?: InsumoNovo } | null

const esquemaRapido = z.object({
  nome: texto(120).min(2, "Informe o nome do insumo."),
  codigo: texto(30).optional(),
  categoria_id: z.string().uuid().optional(),
  dimensao: z.enum(["massa", "volume", "contagem"], { message: "Escolha como o insumo é medido." }),
})

// Código automático a partir do nome: "Tomate pelado" → "TOM-4821"
function codigoAutomatico(nome: string): string {
  const base = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "INS"
  return `${base.padEnd(3, "X")}-${Math.floor(1000 + Math.random() * 9000)}`
}

export async function criarInsumoRapido(_: EstadoNovoInsumo, dados: FormData): Promise<EstadoNovoInsumo> {
  await exigirCustos()
  const v = esquemaRapido.safeParse({
    nome: dados.get("nome"),
    codigo: opcional(dados.get("codigo")),
    categoria_id: opcional(dados.get("categoria_id")),
    dimensao: dados.get("dimensao"),
  })
  if (!v.success) return { erro: v.error.issues[0].message }

  const supabase = await createClient()
  const automatico = !v.data.codigo
  let ultimoErro: unknown = null
  // Com código automático, tenta de novo se o número sorteado já existir
  for (let tentativa = 0; tentativa < (automatico ? 3 : 1); tentativa++) {
    const { data, error } = await supabase
      .from("insumos")
      .insert({
        codigo: (v.data.codigo ?? codigoAutomatico(v.data.nome)).toUpperCase(),
        nome: v.data.nome,
        categoria_id: v.data.categoria_id ?? null,
        dimensao: v.data.dimensao,
      })
      .select("id, nome, dimensao")
      .single()
    if (!error) {
      revalidatePath("/insumos")
      return { novo: { id: data.id, nome: data.nome, dimensao: data.dimensao as Dimensao } }
    }
    ultimoErro = error
    const codigoRepetido = error.code === "23505" && /codigo/.test(`${error.message} ${error.details ?? ""}`)
    if (!(automatico && codigoRepetido)) break
  }
  return { erro: traduzirErro(ultimoErro) }
}

// ------------------------------------------------------------------ registrar compra (lançada à mão)
// Entra validada e atualiza o custo; alta acima do limite da casa vira conferência (trigger da 0012).
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

  const { data: gravado, error } = await supabase.from("historico_precos").insert({
    insumo_id: insumoId,
    estabelecimento_id: s.casa.id,
    fornecedor_id: v.data.fornecedor_id ?? null,
    data_compra: v.data.data_compra,
    quantidade: v.data.quantidade,
    unidade: v.data.unidade,
    valor_total: v.data.valor_total,
    fonte: "manual",
    status: "validado",
    documento_ref: v.data.documento_ref ?? null,
    observacao: v.data.observacao ?? null,
  }).select("status").single()
  if (error) return { erro: traduzirErro(error) }
  revalidatePath(`/insumos/${insumoId}`)
  revalidatePath("/insumos")
  revalidatePath("/pendencias")
  revalidatePath("/fichas", "layout")
  revalidatePath("/cmv")
  return gravado?.status === "pendente"
    ? { ok: "Compra registrada. O preço subiu acima do limite da casa: confira em Compras → conferência. Até lá vale o custo anterior." }
    : { ok: "Compra registrada. O custo do insumo foi atualizado." }
}

// Compra avulsa (sem nota), escolhendo o insumo no próprio formulário
export async function registrarCompraAvulsa(estado: Estado, dados: FormData): Promise<Estado> {
  const insumoId = String(dados.get("insumo_id") ?? "")
  if (!/^[0-9a-f-]{36}$/.test(insumoId)) return { erro: "Escolha o insumo." }
  return registrarCompra(insumoId, estado, dados)
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

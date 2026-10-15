"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { traduzirErro } from "@/lib/erros"
import { lerNfe, type Nota } from "@/lib/nfe"
import type { Dimensao } from "@/lib/formato"
import {
  chaveDescricao, type Arquivo, type Decisao, type EscolhaNota, type PreviaNota,
  type ResultadoImportacao, type ResultadoLeitura, type Vinculo,
} from "@/lib/importacao"

type Supabase = Awaited<ReturnType<typeof createClient>>
type Fornecedor = { id: string; nome: string; documento: string | null }

const LIMITE_ARQUIVOS = 20
const LIMITE_TAMANHO = 2_000_000
const DIM_UNIDADE: Record<string, Dimensao> = { mg: "massa", g: "massa", kg: "massa", ml: "volume", l: "volume", un: "contagem" }

const loteDaNota = (chave: string) => `nfe-${chave}`
const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "")

// "JR DISTRIBUIDORA DE CARNES LTDA" e "JR Distribuidora de Carnes" ficam iguais
function normalizar(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(ltda|me|epp|eireli|sa|s a|cia|comercio|com|ind|industria|de|do|da|dos|das|e)\b/g, " ")
    .replace(/\s+/g, " ").trim()
}

function sugerirFornecedor(nota: Nota, lista: Fornecedor[]): PreviaNota["fornecedorSugerido"] {
  const doc = digitos(nota.emitente.documento)
  const porDoc = doc ? lista.find((f) => digitos(f.documento) === doc) : undefined
  if (porDoc) return { id: porDoc.id, nome: porDoc.nome, porDocumento: true }
  const nomes = [nota.emitente.fantasia, nota.emitente.nome].filter(Boolean).map((n) => normalizar(n!))
  const candidato =
    lista.find((f) => nomes.includes(normalizar(f.nome))) ??
    lista.find((f) => {
      const n = normalizar(f.nome)
      return n.length >= 4 && nomes.some((x) => x.length >= 4 && (x.includes(n) || n.includes(x)))
    })
  return candidato ? { id: candidato.id, nome: candidato.nome, porDocumento: false } : null
}

async function buscarVinculos(supabase: Supabase, fornecedorId: string | null, descricoes: string[]) {
  const vinculos: Record<string, Vinculo | null> = {}
  for (const d of descricoes) vinculos[chaveDescricao(d)] = null
  if (!fornecedorId) return vinculos
  const { data } = await supabase
    .from("alias_insumo")
    .select("descricao_original, quantidade_por_un, unidade, medir_no_recebimento, insumos(id, nome, dimensao)")
    .eq("fornecedor_id", fornecedorId)
  for (const a of data ?? []) {
    const k = chaveDescricao(a.descricao_original as string)
    if (!(k in vinculos)) continue
    const ins = a.insumos as unknown as { id: string; nome: string; dimensao: Dimensao } | null
    if (!ins) continue
    if (a.medir_no_recebimento) {
      vinculos[k] = { tipo: "pesagem", insumoId: ins.id, insumoNome: ins.nome, dimensao: ins.dimensao }
    } else if (a.quantidade_por_un && a.unidade) {
      vinculos[k] = {
        tipo: "conversao", insumoId: ins.id, insumoNome: ins.nome, dimensao: ins.dimensao,
        quantidadePorUnidade: Number(a.quantidade_por_un), unidade: a.unidade as string,
      }
    }
  }
  return vinculos
}

// Casas em que esta nota já foi importada
async function casasComNota(supabase: Supabase, chave: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("itens_importacao").select("estabelecimento_id").eq("lote_importacao", loteDaNota(chave))
  return new Set((data ?? []).map((l) => l.estabelecimento_id as string))
}

function lerArquivos(arquivos: Arquivo[]) {
  const notas: { arquivo: string; nota: Nota }[] = []
  const erros: { arquivo: string; erro: string }[] = []
  const vistas = new Set<string>()
  for (const a of arquivos.slice(0, LIMITE_ARQUIVOS)) {
    if (a.conteudo.length > LIMITE_TAMANHO) { erros.push({ arquivo: a.nome, erro: "Arquivo grande demais para um XML de nota." }); continue }
    try {
      const nota = lerNfe(a.conteudo)
      if (vistas.has(nota.chave)) { erros.push({ arquivo: a.nome, erro: "Mesma nota enviada duas vezes." }); continue }
      vistas.add(nota.chave)
      notas.push({ arquivo: a.nome, nota })
    } catch (e) {
      erros.push({ arquivo: a.nome, erro: e instanceof Error ? e.message : "Não foi possível ler o arquivo." })
    }
  }
  if (arquivos.length > LIMITE_ARQUIVOS) erros.push({ arquivo: "—", erro: `Envie no máximo ${LIMITE_ARQUIVOS} notas por vez.` })
  return { notas, erros }
}

// ------------------------------------------------------------------ 1. ler e pré-visualizar
export async function lerNotas(arquivos: Arquivo[]): Promise<ResultadoLeitura> {
  const s = await exigirCustos()
  const supabase = await createClient()
  const { notas, erros } = lerArquivos(arquivos)
  const { data: forn } = await supabase.from("fornecedores").select("id, nome, documento").eq("ativo", true).order("nome")
  const fornecedores = (forn ?? []) as Fornecedor[]

  const previas: PreviaNota[] = []
  for (const { arquivo, nota } of notas) {
    const sugerido = sugerirFornecedor(nota, fornecedores)
    previas.push({
      arquivo,
      nota,
      jaImportada: (await casasComNota(supabase, nota.chave)).has(s.casa.id),
      fornecedorSugerido: sugerido,
      vinculos: await buscarVinculos(supabase, sugerido?.id ?? null, nota.itens.map((i) => i.descricao)),
    })
  }
  return { previas, erros, fornecedores: fornecedores.map((f) => ({ id: f.id, nome: f.nome })) }
}

// Quando o usuário troca o fornecedor na conferência
export async function vinculosDoFornecedor(fornecedorId: string | null, descricoes: string[]) {
  await exigirCustos()
  const supabase = await createClient()
  return buscarVinculos(supabase, fornecedorId, descricoes)
}

// ------------------------------------------------------------------ 2. importar
async function garantirFornecedor(supabase: Supabase, nota: Nota, escolha: string): Promise<{ id: string; nome: string }> {
  const doc = digitos(nota.emitente.documento) || null
  if (escolha !== "novo") {
    const { data } = await supabase.from("fornecedores").select("id, nome, documento").eq("id", escolha).single()
    if (!data) throw new Error("Fornecedor escolhido não encontrado.")
    if (doc && !data.documento) await supabase.from("fornecedores").update({ documento: doc }).eq("id", data.id)
    return { id: data.id, nome: data.nome }
  }
  const nome = (nota.emitente.fantasia || nota.emitente.nome).trim()
  for (const tentativa of [nome, `${nome} (${doc ?? nota.emitente.nome})`]) {
    const { data, error } = await supabase.from("fornecedores").insert({ nome: tentativa, documento: doc }).select("id, nome").single()
    if (!error) return data
    if (error.code !== "23505") throw new Error(traduzirErro(error))
  }
  throw new Error("Não foi possível cadastrar o fornecedor.")
}

export async function importarNotas(
  arquivos: Arquivo[], escolhas: Record<string, EscolhaNota>, opcoes: { todasAsCasas: boolean } = { todasAsCasas: false },
): Promise<ResultadoImportacao> {
  const s = await exigirCustos()
  const supabase = await createClient()
  const { notas } = lerArquivos(arquivos)
  const resultado: ResultadoImportacao = { notas: [], precosAtualizados: 0, aguardandoPesagem: 0, ignorados: 0 }
  // Casas que recebem o preço: a atual ou todas em que o usuário é gestor/admin
  const casasAlvo = opcoes.todasAsCasas
    ? s.casas.filter((c) => c.papel === "admin" || c.papel === "gestor").map((c) => c.id)
    : [s.casa.id]

  for (const { arquivo, nota } of notas) {
    const registrar = (ok: boolean, mensagem: string, fornecedor = nota.emitente.fantasia || nota.emitente.nome) =>
      resultado.notas.push({ arquivo, numero: nota.numero, fornecedor, ok, mensagem })
    try {
      const escolha = escolhas[nota.chave]
      if (!escolha) { registrar(false, "Nota não conferida."); continue }
      const jaFeitas = await casasComNota(supabase, nota.chave)
      const casasDaNota = casasAlvo.filter((c) => !jaFeitas.has(c))
      if (!casasDaNota.length) { registrar(false, "Esta nota já tinha sido importada."); continue }

      const fornecedor = await garantirFornecedor(supabase, nota, escolha.fornecedor)
      const conhecidos = await buscarVinculos(supabase, fornecedor.id, nota.itens.map((i) => i.descricao))

      // Decisão final de cada item: a do usuário ou o que o sistema já sabia
      const finais = nota.itens.map((item) => {
        const doUsuario = escolha.decisoes[item.n]
        if (doUsuario) return { item, decisao: doUsuario, nova: true }
        const v = conhecidos[chaveDescricao(item.descricao)]
        if (!v) return { item, decisao: null, nova: false }
        const decisao: Decisao = v.tipo === "conversao"
          ? { tipo: "conversao", insumoId: v.insumoId, quantidadePorUnidade: v.quantidadePorUnidade, unidade: v.unidade }
          : { tipo: "pesagem", insumoId: v.insumoId }
        return { item, decisao, nova: false }
      })
      const faltando = finais.filter((f) => !f.decisao)
      if (faltando.length) {
        registrar(false, `Falta definir: ${faltando.map((f) => `item ${f.item.n} (${f.item.descricao})`).join(", ")}.`, fornecedor.nome)
        continue
      }

      // Confere insumos e unidades antes de gravar qualquer coisa
      const ids = [...new Set(finais.flatMap((f) => (f.decisao && f.decisao.tipo !== "ignorar" ? [f.decisao.insumoId] : [])))]
      const { data: ins } = ids.length
        ? await supabase.from("insumos").select("id, nome, dimensao").in("id", ids)
        : { data: [] as { id: string; nome: string; dimensao: string }[] }
      const dimPorInsumo = new Map((ins ?? []).map((i) => [i.id as string, i as { id: string; nome: string; dimensao: Dimensao }]))
      for (const { item, decisao } of finais) {
        if (!decisao || decisao.tipo === "ignorar") continue
        const insumo = dimPorInsumo.get(decisao.insumoId)
        if (!insumo) throw new Error(`Insumo do item ${item.n} não encontrado.`)
        if (decisao.tipo === "conversao") {
          if (!(decisao.quantidadePorUnidade > 0)) throw new Error(`Informe quanto vem em cada ${item.unidade} no item ${item.n}.`)
          if (DIM_UNIDADE[decisao.unidade] !== insumo.dimensao) {
            throw new Error(`Item ${item.n}: ${insumo.nome} é medido em ${insumo.dimensao === "massa" ? "g/kg" : insumo.dimensao === "volume" ? "mL/L" : "un"}.`)
          }
        }
      }

      // Aprende: guarda como este fornecedor escreve cada item
      for (const { item, decisao, nova } of finais) {
        if (!nova || !decisao || decisao.tipo === "ignorar") continue
        const registro = {
          insumo_id: decisao.insumoId,
          quantidade_por_un: decisao.tipo === "conversao" ? decisao.quantidadePorUnidade : null,
          unidade: decisao.tipo === "conversao" ? decisao.unidade : null,
          medir_no_recebimento: decisao.tipo === "pesagem",
        }
        const { data: existente } = await supabase
          .from("alias_insumo").select("id").eq("fornecedor_id", fornecedor.id).ilike("descricao_original", item.descricao.replace(/[\\%_]/g, "\\$&"))
          .limit(1).maybeSingle()
        const { error } = existente
          ? await supabase.from("alias_insumo").update(registro).eq("id", existente.id)
          : await supabase.from("alias_insumo").insert({ ...registro, fornecedor_id: fornecedor.id, descricao_original: item.descricao })
        if (error) throw new Error(traduzirErro(error))
      }

      // Linhas da nota em cada casa: conversões vão para todas as casas escolhidas;
      // pesagem e itens ignorados ficam só na casa que recebeu a mercadoria
      const naCasaAtual = casasDaNota.includes(s.casa.id)
      const linhas = casasDaNota.flatMap((estab) =>
        finais
          .filter(({ decisao }) => estab === s.casa.id || decisao?.tipo === "conversao")
          .map(({ item, decisao }) => ({
            lote_importacao: loteDaNota(nota.chave),
            estabelecimento_id: estab,
            fornecedor_id: fornecedor.id,
            data_compra: nota.dataEmissao,
            documento_ref: `NF ${nota.numero}${nota.serie ? `-${nota.serie}` : ""}`,
            ncm: item.ncm,
            descricao_original: item.descricao,
            unidade_nota: item.unidade || "UN",
            quantidade_nota: item.quantidade,
            preco_unitario_nota: Math.round(item.valorUnitario * 10000) / 10000,
            valor_total: item.valorTotal,
            insumo_id: decisao && decisao.tipo !== "ignorar" ? decisao.insumoId : null,
            status: decisao?.tipo === "ignorar" ? "ignorado" : "pendente",
            motivo_pendencia: decisao?.tipo === "pesagem" ? "Aguardando pesagem/contagem no recebimento"
              : decisao?.tipo === "ignorar" ? "Não é insumo (ignorado na importação)" : null,
          })),
      )
      const { error: eLinhas } = await supabase.from("itens_importacao").insert(linhas)
      if (eLinhas) throw new Error(traduzirErro(eLinhas))

      // Itens com conversão viram preço validado (função do banco)
      let atualizados = 0
      const conversoes = new Map<string, { descricao: string; qtd: number; unidade: string }>()
      for (const { item, decisao } of finais) {
        if (decisao?.tipo === "conversao") {
          conversoes.set(chaveDescricao(item.descricao), { descricao: item.descricao, qtd: decisao.quantidadePorUnidade, unidade: decisao.unidade })
        }
      }
      const falhas: string[] = []
      for (const c of conversoes.values()) {
        const { data, error } = await supabase.rpc("confirmar_conversao", {
          p_fornecedor: fornecedor.id, p_descricao: c.descricao, p_qtd_por_unidade: c.qtd, p_unidade: c.unidade,
        })
        if (error) falhas.push(`${c.descricao}: ${traduzirErro(error)}`)
        else atualizados += Number(data ?? 0)
      }
      const pesagem = naCasaAtual ? finais.filter((f) => f.decisao?.tipo === "pesagem").length : 0
      const ignorados = naCasaAtual ? finais.filter((f) => f.decisao?.tipo === "ignorar").length : 0
      resultado.precosAtualizados += atualizados
      resultado.aguardandoPesagem += pesagem
      resultado.ignorados += ignorados
      registrar(
        falhas.length === 0,
        falhas.length
          ? `Importada, mas sem preço para: ${falhas.join("; ")}`
          : `${atualizados} preço(s) atualizado(s) em ${casasDaNota.length} casa(s), ${pesagem} aguardando pesagem, ${ignorados} ignorado(s).`,
        fornecedor.nome,
      )
    } catch (e) {
      registrar(false, e instanceof Error ? e.message : traduzirErro(e))
    }
  }

  revalidatePath("/insumos", "layout")
  revalidatePath("/pendencias", "layout")
  return resultado
}

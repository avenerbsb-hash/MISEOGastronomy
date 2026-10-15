// Tipos da importação de NF-e, compartilhados entre servidor e tela
import type { Nota } from "@/lib/nfe"
import type { Dimensao } from "@/lib/formato"

// O que o sistema já sabe sobre um item (aprendido em importações anteriores)
export type Vinculo =
  | { tipo: "conversao"; insumoId: string; insumoNome: string; dimensao: Dimensao; quantidadePorUnidade: number; unidade: string }
  | { tipo: "pesagem"; insumoId: string; insumoNome: string; dimensao: Dimensao }

// O que o usuário decidiu na conferência
export type Decisao =
  | { tipo: "conversao"; insumoId: string; quantidadePorUnidade: number; unidade: string }
  | { tipo: "pesagem"; insumoId: string }
  | { tipo: "ignorar" }

export type Arquivo = { nome: string; conteudo: string }

export type PreviaNota = {
  arquivo: string
  nota: Nota
  jaImportada: boolean
  fornecedorSugerido: { id: string; nome: string; porDocumento: boolean } | null
  vinculos: Record<string, Vinculo | null>   // chave: descrição em minúsculas
}

export type ResultadoLeitura = {
  previas: PreviaNota[]
  erros: { arquivo: string; erro: string }[]
  fornecedores: { id: string; nome: string }[]
}

export type EscolhaNota = { fornecedor: string /* id existente ou "novo" */; decisoes: Record<number, Decisao> }

export type ResultadoImportacao = {
  notas: { arquivo: string; numero: string; fornecedor: string; ok: boolean; mensagem: string }[]
  precosAtualizados: number
  aguardandoPesagem: number
  ignorados: number
}

export const chaveDescricao = (d: string) => d.trim().toLowerCase()

// Unidade da nota que já é unidade de medida: sugere conversão 1 para 1
export const UNIDADE_NOTA_PADRAO: Record<string, { unidade: string; dimensao: Dimensao }> = {
  KG: { unidade: "kg", dimensao: "massa" }, KGS: { unidade: "kg", dimensao: "massa" },
  G: { unidade: "g", dimensao: "massa" }, GR: { unidade: "g", dimensao: "massa" },
  L: { unidade: "l", dimensao: "volume" }, LT: { unidade: "l", dimensao: "volume" }, LTS: { unidade: "l", dimensao: "volume" },
  ML: { unidade: "ml", dimensao: "volume" },
  UN: { unidade: "un", dimensao: "contagem" }, UND: { unidade: "un", dimensao: "contagem" },
  UNID: { unidade: "un", dimensao: "contagem" }, PC: { unidade: "un", dimensao: "contagem" }, PCA: { unidade: "un", dimensao: "contagem" },
}

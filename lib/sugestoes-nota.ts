// Leitura da descrição do item da nota para ajudar na conferência:
// tamanho da embalagem, quantidade por caixa/fardo, nome limpo e insumos parecidos.
// Só sugere; quem confirma é o usuário.
import type { Dimensao } from "@/lib/formato"

export function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

const MEDIDAS: Record<string, { unidade: string; dimensao: Dimensao }> = {
  KG: { unidade: "kg", dimensao: "massa" }, KGS: { unidade: "kg", dimensao: "massa" },
  G: { unidade: "g", dimensao: "massa" }, GR: { unidade: "g", dimensao: "massa" }, GRS: { unidade: "g", dimensao: "massa" },
  L: { unidade: "l", dimensao: "volume" }, LT: { unidade: "l", dimensao: "volume" }, LTS: { unidade: "l", dimensao: "volume" },
  ML: { unidade: "ml", dimensao: "volume" },
}
const UNIDADE_DA_NOTA: Record<string, { unidade: string; dimensao: Dimensao }> = {
  ...MEDIDAS,
  UN: { unidade: "un", dimensao: "contagem" }, UND: { unidade: "un", dimensao: "contagem" }, UNID: { unidade: "un", dimensao: "contagem" },
}

const num = (s: string) => Number(s.replace(",", "."))

// Tamanho de cada embalagem: "750ML", "1 KG", "5,02L", "2,6KG"
function tamanho(desc: string): { valor: number; unidade: string; dimensao: Dimensao } | null {
  const achados = [...desc.toUpperCase().matchAll(/(\d+(?:[.,]\d+)?)\s?(KGS?|GRS?|G|LTS?|L|ML)\b/g)]
  const ultimo = achados.at(-1)
  if (!ultimo) return null
  const m = MEDIDAS[ultimo[2]]
  return m ? { valor: num(ultimo[1]), ...m } : null
}

// Quantas unidades vêm em cada caixa/fardo: "C/12", "CX/0012", "FD/0030", "12X1L", "SIX PACK"
function porEmbalagem(desc: string, unidadeNota: string): number | null {
  const d = desc.toUpperCase()
  const barra = d.match(/\b(?:C|CX|CXA|FD|FDO|PCT|PC|DP|FARDO)\s?\/\s?0*(\d{1,4})\b/)
  if (barra && Number(barra[1]) > 1) return Number(barra[1])
  const vezes = d.match(/\b(\d{1,3})\s?X\s?\d/)
  if (vezes) return Number(vezes[1])
  if (/\bSIX\s?PACK\b/.test(d)) return 6
  if (/\bFOUR\s?PACK\b/.test(d)) return 4
  if (/\bDZ|DUZIA\b/.test(unidadeNota.toUpperCase())) return 12
  return null
}

// Conversão sugerida: "1 <unidade da nota> = quantidade unidade"
export function sugerirConversao(
  descricao: string, unidadeNota: string, dimensao: Dimensao,
): { quantidade: number; unidade: string } | null {
  const un = unidadeNota.toUpperCase()
  const direta = UNIDADE_DA_NOTA[un]
  if (direta && direta.dimensao === dimensao) return { quantidade: 1, unidade: direta.unidade }
  const pacote = porEmbalagem(descricao, un) ?? 1
  if (dimensao === "contagem") return { quantidade: pacote, unidade: "un" }
  const t = tamanho(descricao)
  if (!t || t.dimensao !== dimensao) return null
  return { quantidade: Math.round(t.valor * pacote * 1000) / 1000, unidade: t.unidade }
}

// Medida provável de um insumo novo: lata/garrafa em caixa ou dúzia → unidade; senão pelo tamanho
export function dimensaoProvavel(descricao: string, unidadeNota: string): Dimensao {
  const un = unidadeNota.toUpperCase()
  if (UNIDADE_DA_NOTA[un] && un !== "UN" && un !== "UND" && un !== "UNID") return UNIDADE_DA_NOTA[un].dimensao
  // "LT" sozinho é lata; "1LT" é litro
  if (porEmbalagem(descricao, un) || /\bLATA\b|\bLT\b/i.test(descricao)) return "contagem"
  return tamanho(descricao)?.dimensao ?? "contagem"
}

// Nome limpo para cadastrar: tira código de embalagem, tamanho e siglas de logística
export function nomeSugerido(descricao: string): string {
  const limpo = descricao
    .replace(/\b[A-Z]{1,4}\/\d{2,4}\/[A-Z]{1,4}\b/gi, " ")         // UN/0001/UN, FD/0030/UN
    .replace(/\b(?:C|CX)\s?\/\s?\d{1,4}\b/gi, " ")                   // C/12
    .replace(/\b\d{1,3}\s?X\s?\d+(?:[.,]\d+)?\s?(?:KG|G|GR|L|LT|ML)\b/gi, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s?(?:KGS?|GRS?|G|LTS?|L|ML)\b/gi, " ")
    .replace(/\b(?:SH|NPAL|SIX\s?PACK|FOUR\s?PACK)\b/gi, " ")
    .replace(/[.\-–_/]+\s*$/g, " ")
    .replace(/\s+/g, " ").trim()
  const minusculas = new Set(["de", "da", "do", "das", "dos", "e", "com", "sem", "para", "em"])
  return limpo
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ")
}

// Palavras que identificam o produto (sem tamanhos, códigos e palavras genéricas)
const GENERICAS = new Set(["para", "com", "sem", "tipo", "integral", "un", "cx", "kg", "ml", "lt", "pct", "fd", "npal", "lata", "garrafa", "bovino", "resfriado", "congelado"])
export function palavras(t: string): string[] {
  return normalizar(t)
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((p) => p.length >= 3 && !/^\d/.test(p) && !GENERICAS.has(p))
}

// Insumos parecidos com o item da nota, do mais parecido para o menos
export function insumosParecidos<T extends { id: string; nome: string }>(descricao: string, insumos: T[], limite = 5): T[] {
  const alvo = new Set(palavras(descricao))
  if (!alvo.size) return []
  return insumos
    .map((i) => {
      const ps = palavras(i.nome)
      const comuns = ps.filter((p) => alvo.has(p) || [...alvo].some((a) => a.startsWith(p) || p.startsWith(a))).length
      return { i, nota: comuns / Math.max(1, ps.length) + comuns }
    })
    .filter((x) => x.nota >= 1)
    .sort((a, b) => b.nota - a.nota)
    .slice(0, limite)
    .map((x) => x.i)
}

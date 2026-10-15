import { XMLParser } from "fast-xml-parser"

// Leitura do XML da NF-e (modelo 55) e NFC-e (modelo 65), layout 4.00.
// Só extrai dados da nota; nenhum custo do insumo é calculado aqui.

export type ItemNota = {
  n: number                 // número do item na nota (nItem)
  codigo: string            // código do produto no fornecedor (cProd)
  descricao: string         // xProd
  ncm: string | null
  unidade: string           // uCom, ex.: KG, UN, CX, PCT
  quantidade: number        // qCom
  valorUnitario: number     // vUnCom
  valorTotal: number        // valor pago pelo item: produtos − desconto + frete + seguro + outros + IPI + ICMS-ST
}

export type Nota = {
  chave: string             // 44 dígitos
  numero: string
  serie: string
  dataEmissao: string       // AAAA-MM-DD
  autorizada: boolean | null // null quando o XML não traz o protocolo
  emitente: { documento: string; nome: string; fantasia: string | null }
  destinatario: { documento: string | null; nome: string | null }
  valorNota: number
  itens: ItemNota[]
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,      // mantém CNPJ, códigos e NCM como texto (zeros à esquerda)
  parseAttributeValue: false,
  trimValues: true,
})

type No = Record<string, unknown>
const obj = (v: unknown): No => (v && typeof v === "object" ? (v as No) : {})
const txt = (v: unknown): string => (v == null ? "" : typeof v === "object" ? String((v as No)["#text"] ?? "") : String(v))
const num = (v: unknown): number => {
  const n = Number(txt(v).replace(",", "."))
  return Number.isFinite(n) ? n : 0
}
const lista = <T,>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])
const centavos = (v: number) => Math.round(v * 100) / 100

// Grupo ICMS do item vem com nome variável (ICMS00, ICMS10, ICMSSN202…)
function icmsSt(imposto: No): number {
  const icms = obj(imposto.ICMS)
  return Object.values(icms).reduce<number>((t, g) => t + num(obj(g).vICMSST), 0)
}

export function lerNfe(xml: string): Nota {
  let raiz: No
  try {
    raiz = parser.parse(xml) as No
  } catch {
    throw new Error("O arquivo não é um XML válido.")
  }
  const proc = obj(raiz.nfeProc)
  const nfe = obj(proc.NFe ?? raiz.NFe)
  const inf = obj(nfe.infNFe)
  if (!Object.keys(inf).length) {
    throw new Error("Este XML não é de uma NF-e. Use o XML da nota fiscal de compra (não o PDF, CT-e ou boleto).")
  }

  const ide = obj(inf.ide)
  const emit = obj(inf.emit)
  const dest = obj(inf.dest)
  const total = obj(obj(inf.total).ICMSTot)
  const infProt = obj(obj(proc.protNFe).infProt)

  let chave = txt(inf["@_Id"]).replace(/^NFe/i, "")
  if (!/^\d{44}$/.test(chave)) chave = txt(infProt.chNFe)
  if (!/^\d{44}$/.test(chave)) throw new Error("Não encontrei a chave de acesso (44 dígitos) neste XML.")

  const data = txt(ide.dhEmi || ide.dEmi).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error("Não encontrei a data de emissão neste XML.")

  const itens: ItemNota[] = lista(inf.det as No | No[]).map((d, i) => {
    const det = obj(d)
    const prod = obj(det.prod)
    const imposto = obj(det.imposto)
    const vIPI = num(obj(obj(imposto.IPI).IPITrib).vIPI)
    const valorTotal =
      num(prod.vProd) - num(prod.vDesc) + num(prod.vFrete) + num(prod.vSeg) + num(prod.vOutro) + vIPI + icmsSt(imposto)
    return {
      n: Number(txt(det["@_nItem"])) || i + 1,
      codigo: txt(prod.cProd),
      descricao: txt(prod.xProd).replace(/\s+/g, " ").trim(),
      ncm: txt(prod.NCM) || null,
      unidade: txt(prod.uCom).toUpperCase(),
      quantidade: num(prod.qCom),
      valorUnitario: num(prod.vUnCom),
      valorTotal: centavos(Math.max(0, valorTotal)),
    }
  })
  if (!itens.length) throw new Error("A nota não tem itens.")

  const cStat = txt(infProt.cStat)
  return {
    chave,
    numero: txt(ide.nNF),
    serie: txt(ide.serie),
    dataEmissao: data,
    autorizada: cStat ? cStat === "100" || cStat === "150" : null,
    emitente: {
      documento: txt(emit.CNPJ || emit.CPF),
      nome: txt(emit.xNome),
      fantasia: txt(emit.xFant) || null,
    },
    destinatario: { documento: txt(dest.CNPJ || dest.CPF) || null, nome: txt(dest.xNome) || null },
    valorNota: num(total.vNF),
    itens,
  }
}

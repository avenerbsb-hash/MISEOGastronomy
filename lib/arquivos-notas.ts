import JSZip from "jszip"
import type { Arquivo } from "@/lib/importacao"

export const LIMITE_NOTAS_POR_ENVIO = 300

// Lê os arquivos escolhidos no navegador: XML soltos e .zip (exportação do xFácil, contador etc.)
export async function lerArquivosEscolhidos(lista: File[]): Promise<{ arquivos: Arquivo[]; avisos: string[] }> {
  const arquivos: Arquivo[] = []
  const avisos: string[] = []
  for (const f of lista) {
    const nome = f.name.toLowerCase()
    if (nome.endsWith(".zip")) {
      try {
        const zip = await JSZip.loadAsync(f)
        const xmls = Object.values(zip.files).filter(
          (e) => !e.dir && e.name.toLowerCase().endsWith(".xml") && !e.name.startsWith("__MACOSX/"),
        )
        if (!xmls.length) avisos.push(`${f.name}: nenhum XML dentro do .zip.`)
        for (const e of xmls) {
          arquivos.push({ nome: `${f.name} › ${e.name.split("/").pop()}`, conteudo: await e.async("string") })
        }
      } catch {
        avisos.push(`${f.name}: não foi possível abrir o .zip.`)
      }
    } else if (nome.endsWith(".xml")) {
      arquivos.push({ nome: f.name, conteudo: await f.text() })
    } else {
      avisos.push(`${f.name}: envie o XML da nota ou um .zip com os XMLs (PDF ainda não é lido aqui).`)
    }
  }
  if (arquivos.length > LIMITE_NOTAS_POR_ENVIO) {
    avisos.push(`Foram encontradas ${arquivos.length} notas; serão lidas as primeiras ${LIMITE_NOTAS_POR_ENVIO}. Envie o restante depois.`)
    arquivos.length = LIMITE_NOTAS_POR_ENVIO
  }
  return { arquivos, avisos }
}

export function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho))
  return lotes
}

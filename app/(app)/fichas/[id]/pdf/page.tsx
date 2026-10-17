import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { exigirProducao, podeVerCustos } from "@/lib/sessao"
import { dataHora } from "@/lib/formato"
import { type LinhaProducao } from "@/components/ficha-producao"
import { type LinhaGerencial } from "@/components/tabela-custos"
import { BotaoImprimir } from "@/components/botao-imprimir"
import { FolhaFicha, type CustosFolha } from "@/components/folha-ficha"
import { cn } from "@/lib/utils"
import { precosDasFichas } from "../../dados"

// PDF da ficha: "preparo" (sem R$, para a cozinha/bar) ou "custos" (gestão: custo, preço e CMV)
export default async function PdfFicha({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ modo?: string }> }) {
  const s = await exigirProducao()
  const { id } = await params
  const podeCustos = podeVerCustos(s)
  const modo = podeCustos && (await searchParams).modo !== "preparo" ? "custos" : "preparo"
  const supabase = await createClient()

  const [{ data: receita }, { data: producao }] = await Promise.all([
    supabase.from("receitas").select("codigo, nome").eq("id", id).maybeSingle(),
    supabase.from("vw_ficha_producao").select("*").eq("receita_id", id).order("ordem"),
  ])
  const linhas = (producao ?? []) as LinhaProducao[]
  if (!receita || !linhas.length) {
    return <p className="text-sm text-muted-foreground">Esta ficha ainda não tem versão aprovada, então não há PDF.</p>
  }

  // Custos só são buscados no modo gestão (produção nunca chega aqui)
  let custos: CustosFolha | undefined
  if (modo === "custos") {
    const [c, g, precos, casa] = await Promise.all([
      supabase.rpc("custo_receita", { p_receita: id, p_estab: s.casa.id }),
      supabase.rpc("ficha_gerencial", { p_receita: id, p_estab: s.casa.id }),
      precosDasFichas(s.casa.id),
      supabase.from("estabelecimentos").select("cmv_alvo_padrao").eq("id", s.casa.id).maybeSingle(),
    ])
    custos = {
      custo: (c.data as number | null) ?? null,
      linhas: (g.data ?? []) as LinhaGerencial[],
      preco: precos.get(id),
      meta: Number(casa.data?.cmv_alvo_padrao ?? 30),
    }
  }

  return (
    <div className="grid gap-4">
      {/* opções na tela (não saem no PDF) */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        {podeCustos ? (
          <div className="flex gap-1 rounded-lg border p-1 text-sm">
            <Link href={`/fichas/${id}/pdf`} className={cn("rounded-md px-3 py-1.5", modo === "custos" ? "bg-foreground text-background" : "hover:bg-muted")}>Com custos e CMV</Link>
            <Link href={`/fichas/${id}/pdf?modo=preparo`} className={cn("rounded-md px-3 py-1.5", modo === "preparo" ? "bg-foreground text-background" : "hover:bg-muted")}>Só preparo (sem R$)</Link>
          </div>
        ) : <span />}
        <BotaoImprimir>Emitir PDF</BotaoImprimir>
      </div>
      <p className="text-xs text-muted-foreground print:hidden">
        Na janela que abrir, escolha <b>Salvar como PDF</b> (ou a impressora). Abaixo, a prévia da folha.
      </p>
      <FolhaFicha nome={receita.nome} codigo={receita.codigo} casa={s.casa} emitido={dataHora(new Date().toISOString())} linhas={linhas} custos={custos} />
    </div>
  )
}

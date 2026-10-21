import type { Metadata } from "next"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { exigirProducao, podeVerCustos } from "@/lib/sessao"
import { custoPorUnidade, dataHora, type Dimensao } from "@/lib/formato"
import { type LinhaProducao } from "@/components/ficha-producao"
import { type LinhaGerencial } from "@/components/tabela-custos"
import { BotaoImprimir } from "@/components/botao-imprimir"
import { FolhaFicha, type CustosFolha } from "@/components/folha-ficha"
import { LogoCasa } from "@/components/logo-casa"
import { daCasa } from "@/lib/dados"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "PDF de preparos" }

const LIMITE = 60

// PDF de um ou vários preparos (?ids=a&ids=b ou ?ids=a,b): uma ficha por página; com mais de um, índice no início.
// "preparo" (sem R$, para a produção) ou "custos" (gestão).
export default async function PdfPreparos({ searchParams }: { searchParams: Promise<{ ids?: string | string[]; modo?: string }> }) {
  const s = await exigirProducao()
  const podeCustos = podeVerCustos(s)
  const sp = await searchParams
  const modo = podeCustos && sp.modo !== "preparo" ? "custos" : "preparo"
  const ids = [...new Set([sp.ids ?? []].flat().flatMap((v) => v.split(",")).map((v) => v.trim())
    .filter((v) => /^[0-9a-f-]{36}$/i.test(v)))].slice(0, LIMITE)
  const supabase = await createClient()

  const voltar = <Link href="/subprodutos" className="text-muted-foreground hover:underline">← Preparos e bases</Link>
  if (!ids.length) {
    return <p className="text-sm text-muted-foreground">{voltar}<br />Nenhum preparo escolhido. Marque os preparos na lista e clique em Emitir PDF.</p>
  }

  const [{ data: rec }, { data: producao }] = await Promise.all([
    supabase.from("receitas").select("id, codigo, nome, dimensao_saida").eq("tipo", "subproduto").in("id", ids).or(daCasa(s.casa.id)).order("nome"),
    supabase.from("vw_ficha_producao").select("*").in("receita_id", ids).order("ordem"),
  ])
  const receitas = (rec ?? []) as { id: string; codigo: string; nome: string; dimensao_saida: Dimensao }[]
  const porReceita = new Map<string, LinhaProducao[]>()
  for (const l of (producao ?? []) as (LinhaProducao & { receita_id: string })[]) porReceita.set(l.receita_id, [...(porReceita.get(l.receita_id) ?? []), l])
  const comFicha = receitas.filter((r) => porReceita.has(r.id))
  const semVersao = receitas.filter((r) => !porReceita.has(r.id))

  // custos só no modo gestão (produção nunca chega aqui)
  const custos = new Map<string, CustosFolha>()
  if (modo === "custos") {
    for (let i = 0; i < comFicha.length; i += 10) {
      const lote = comFicha.slice(i, i + 10)
      const res = await Promise.all(lote.flatMap((r) => [
        supabase.rpc("custo_receita", { p_receita: r.id, p_estab: s.casa.id }),
        supabase.rpc("ficha_gerencial", { p_receita: r.id, p_estab: s.casa.id }),
      ]))
      lote.forEach((r, k) => custos.set(r.id, {
        custo: (res[2 * k].data as number | null) ?? null,
        linhas: (res[2 * k + 1].data ?? []) as LinhaGerencial[],
        preco: undefined, meta: 0,
      }))
    }
  }

  const qs = (m: string) => {
    const p = new URLSearchParams()
    ids.forEach((id) => p.append("ids", id))
    if (m === "preparo") p.set("modo", "preparo")
    return `/subprodutos/pdf?${p}`
  }
  const emitido = dataHora(new Date().toISOString())
  const varios = comFicha.length > 1

  return (
    <div className="grid gap-4">
      <div className="print:hidden">
        <div className="mb-2 text-sm">{voltar}</div>
        <h1 className="text-xl font-semibold">{varios ? `PDF de ${comFicha.length} preparos` : "PDF do preparo"}</h1>
      </div>

      <div className="grid gap-2 rounded-xl border p-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {podeCustos ? (
            <div className="flex gap-1 rounded-lg border p-1 text-sm">
              <Link href={qs("custos")} className={cn("rounded-md px-3 py-1.5", modo === "custos" ? "bg-foreground text-background" : "hover:bg-muted")}>Com custos</Link>
              <Link href={qs("preparo")} className={cn("rounded-md px-3 py-1.5", modo === "preparo" ? "bg-foreground text-background" : "hover:bg-muted")}>Ficha de produção (sem R$)</Link>
            </div>
          ) : <span />}
          {comFicha.length ? <BotaoImprimir>Emitir PDF{varios ? ` (${comFicha.length})` : ""}</BotaoImprimir> : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Na janela que abrir, escolha <b>Salvar como PDF</b>. Cada preparo começa numa página nova.
          {semVersao.length ? <> Fora do PDF por não ter versão aprovada: {semVersao.map((r) => r.nome).join(", ")}.</> : null}
        </p>
      </div>

      {varios ? (
        <article className="grid gap-4 rounded-xl border bg-background p-5 print:rounded-none print:border-0 print:p-0 print:text-[11px]">
          <header className="flex items-start justify-between gap-3 border-b pb-3">
            <div className="flex items-center gap-3">
              <LogoCasa url={s.casa.logo} nome={s.casa.nome} className="h-16" />
              <div>
                <h2 className="text-2xl font-semibold">Preparos e bases</h2>
                <p className="text-sm text-muted-foreground">
                  {s.casa.nome} · {comFicha.length} preparos · {modo === "custos" ? "com custos" : "fichas de produção (sem valores)"}
                </p>
              </div>
            </div>
            <span className="whitespace-nowrap text-xs text-muted-foreground">MISEO · {emitido}</span>
          </header>
          <ol className="divide-y rounded-lg border text-sm">
            {comFicha.map((r, i) => {
              const c = custos.get(r.id)
              return (
                <li key={r.id} className="flex justify-between gap-3 px-3 py-1.5">
                  <span>{i + 1}. {r.nome} <span className="text-xs text-muted-foreground">{r.codigo}</span></span>
                  {c ? <span className="whitespace-nowrap tabular-nums text-muted-foreground">{c.custo != null ? custoPorUnidade(c.custo, r.dimensao_saida) : "falta preço"}</span> : null}
                </li>
              )
            })}
          </ol>
        </article>
      ) : null}

      {comFicha.map((r) => (
        <FolhaFicha key={r.id} className={varios ? "print:break-before-page" : undefined}
          nome={r.nome} codigo={r.codigo} casa={s.casa} emitido={emitido}
          linhas={porReceita.get(r.id)!} custos={custos.get(r.id)} subproduto={{ dimensao: r.dimensao_saida }} />
      ))}
      {!comFicha.length ? <p className="text-sm text-muted-foreground">Nenhum dos preparos escolhidos tem versão aprovada.</p> : null}
    </div>
  )
}

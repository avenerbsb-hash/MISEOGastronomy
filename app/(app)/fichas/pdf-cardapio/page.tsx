import type { Metadata } from "next"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { exigirProducao, podeVerCustos } from "@/lib/sessao"
import { dataHora, percentual, reais } from "@/lib/formato"
import { type LinhaProducao } from "@/components/ficha-producao"
import { type LinhaGerencial } from "@/components/tabela-custos"
import { BotaoImprimir } from "@/components/botao-imprimir"
import { FolhaFicha, type CustosFolha } from "@/components/folha-ficha"
import { LogoCasa } from "@/components/logo-casa"
import { cn } from "@/lib/utils"
import { precosDasFichas } from "../dados"

export const metadata: Metadata = { title: "PDF do cardápio" }

type Item = { receita_id: string; nome_exibicao: string | null; secao: string | null; ordem: number; receitas: { nome: string; codigo: string; ativo: boolean } | null }

// PDF com todas as fichas de um cardápio: índice + uma folha por ficha (preparo ou com custos)
export default async function PdfCardapio({ searchParams }: { searchParams: Promise<{ cardapio?: string; modo?: string }> }) {
  const s = await exigirProducao()
  const podeCustos = podeVerCustos(s)
  const sp = await searchParams
  const modo = podeCustos && sp.modo !== "preparo" ? "custos" : "preparo"
  const supabase = await createClient()

  const { data: listaCardapios } = await supabase.from("cardapios").select("id, nome, status")
    .eq("estabelecimento_id", s.casa.id).neq("status", "arquivado").order("nome")
  const cardapios = (listaCardapios ?? []) as { id: string; nome: string; status: string }[]
  const atual = cardapios.find((c) => c.id === sp.cardapio) ?? cardapios[0]
  const href = (m: { cardapio?: string; modo?: string }) => {
    const p = new URLSearchParams()
    const c = m.cardapio ?? atual?.id
    if (c) p.set("cardapio", c)
    if ((m.modo ?? modo) === "preparo" && podeCustos) p.set("modo", "preparo")
    return `/fichas/pdf-cardapio?${p}`
  }

  if (!atual) return <p className="text-sm text-muted-foreground">Esta casa ainda não tem cardápio.</p>

  const { data: itensLidos } = await supabase.from("itens_cardapio")
    .select("receita_id, nome_exibicao, secao, ordem, receitas!inner(nome, codigo, ativo)")
    .eq("cardapio_id", atual.id).eq("ativo", true).eq("receitas.ativo", true)
    .order("secao", { nullsFirst: false }).order("ordem")
  const itens = (itensLidos ?? []) as unknown as Item[]
  const ids = itens.map((i) => i.receita_id)

  // preparo de todas as fichas numa consulta só
  const { data: producao } = ids.length
    ? await supabase.from("vw_ficha_producao").select("*").in("receita_id", ids).order("ordem")
    : { data: [] }
  const porFicha = new Map<string, LinhaProducao[]>()
  for (const l of (producao ?? []) as (LinhaProducao & { receita_id: string })[]) porFicha.set(l.receita_id, [...(porFicha.get(l.receita_id) ?? []), l])

  // custos (modo gestão): preço/CMV pelo painel e a tabela de cada ficha pelo banco
  const custos = new Map<string, CustosFolha>()
  if (modo === "custos" && ids.length) {
    const [precos, casa] = await Promise.all([
      precosDasFichas(s.casa.id),
      supabase.from("estabelecimentos").select("cmv_alvo_padrao").eq("id", s.casa.id).maybeSingle(),
    ])
    const meta = Number(casa.data?.cmv_alvo_padrao ?? 30)
    const comVersao = ids.filter((id) => porFicha.has(id))
    for (let i = 0; i < comVersao.length; i += 10) {
      const lote = comVersao.slice(i, i + 10)
      const res = await Promise.all(lote.flatMap((id) => [
        supabase.rpc("custo_receita", { p_receita: id, p_estab: s.casa.id }),
        supabase.rpc("ficha_gerencial", { p_receita: id, p_estab: s.casa.id }),
      ]))
      lote.forEach((id, k) => custos.set(id, {
        custo: (res[2 * k].data as number | null) ?? null,
        linhas: (res[2 * k + 1].data ?? []) as LinhaGerencial[],
        preco: precos.get(id),
        meta,
      }))
    }
  }

  const comFicha = itens.filter((i) => porFicha.has(i.receita_id))
  const semVersao = itens.filter((i) => !porFicha.has(i.receita_id))
  const secoes = new Map<string, Item[]>()
  for (const i of comFicha) {
    const k = i.secao?.trim() || "Sem seção"
    secoes.set(k, [...(secoes.get(k) ?? []), i])
  }
  const emitido = dataHora(new Date().toISOString())
  const nomeDo = (i: Item) => i.nome_exibicao ?? i.receitas?.nome ?? "—"

  return (
    <div className="grid gap-4">
      <div className="print:hidden">
        <div className="mb-2 text-sm"><Link href="/fichas" className="text-muted-foreground hover:underline">← Fichas técnicas</Link></div>
        <h1 className="text-xl font-semibold">PDF do cardápio</h1>
        <p className="text-sm text-muted-foreground">Todas as fichas técnicas de um cardápio, uma por página, com índice no início.</p>
      </div>

      {/* opções na tela (não saem no PDF) */}
      <div className="grid gap-3 rounded-xl border p-4 print:hidden">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Cardápio:</span>
          {cardapios.map((c) => (
            <Link key={c.id} href={href({ cardapio: c.id })} aria-current={c.id === atual.id ? "page" : undefined}
              className={cn("rounded-full border px-3 py-1.5", c.id === atual.id ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}>
              {c.nome}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {podeCustos ? (
            <div className="flex gap-1 rounded-lg border p-1 text-sm">
              <Link href={href({ modo: "custos" })} className={cn("rounded-md px-3 py-1.5", modo === "custos" ? "bg-foreground text-background" : "hover:bg-muted")}>Com custos e CMV</Link>
              <Link href={href({ modo: "preparo" })} className={cn("rounded-md px-3 py-1.5", modo === "preparo" ? "bg-foreground text-background" : "hover:bg-muted")}>Só preparo (sem R$)</Link>
            </div>
          ) : <span />}
          <BotaoImprimir>Emitir PDF ({comFicha.length} {comFicha.length === 1 ? "ficha" : "fichas"})</BotaoImprimir>
        </div>
        <p className="text-xs text-muted-foreground">
          Na janela que abrir, escolha <b>Salvar como PDF</b>. Com muitas fichas, a janela pode levar alguns segundos para abrir.
          {semVersao.length ? <> Fora do PDF por não ter versão aprovada: {semVersao.map(nomeDo).join(", ")}.</> : null}
        </p>
      </div>

      {!comFicha.length ? <p className="text-sm text-muted-foreground">Nenhuma ficha aprovada neste cardápio.</p> : (
        <>
          {/* capa e índice */}
          <article className="grid gap-4 rounded-xl border bg-background p-5 print:rounded-none print:border-0 print:p-0 print:text-[11px]">
            <header className="flex items-start justify-between gap-3 border-b pb-3">
              <div className="flex items-center gap-3">
                <LogoCasa url={s.casa.logo} nome={s.casa.nome} className="h-16" />
                <div>
                  <h2 className="text-2xl font-semibold">Fichas técnicas · {atual.nome}</h2>
                  <p className="text-sm text-muted-foreground">
                    {s.casa.nome} · {comFicha.length} {comFicha.length === 1 ? "ficha" : "fichas"} · {modo === "custos" ? "com custos e CMV" : "preparo (sem valores)"}
                  </p>
                </div>
              </div>
              <span className="whitespace-nowrap text-xs text-muted-foreground">MISEO · {emitido}</span>
            </header>
            {[...secoes.entries()].map(([secao, lista]) => (
              <section key={secao} className="print:break-inside-avoid">
                <h3 className="mb-1 text-sm font-semibold">{secao}</h3>
                <ol className="divide-y rounded-lg border text-sm">
                  {lista.map((i) => {
                    const c = custos.get(i.receita_id)
                    return (
                      <li key={i.receita_id} className="flex justify-between gap-3 px-3 py-1.5">
                        <span>{nomeDo(i)} <span className="text-xs text-muted-foreground">{i.receitas?.codigo}</span></span>
                        {c ? (
                          <span className="whitespace-nowrap tabular-nums text-muted-foreground">
                            {c.custo != null ? reais(c.custo) : "falta preço"}
                            {c.preco?.cmv != null ? <> · CMV <span className={Number(c.preco.cmv) > c.meta ? "font-semibold text-alta" : "text-queda"}>{percentual(c.preco.cmv)}</span></> : null}
                          </span>
                        ) : null}
                      </li>
                    )
                  })}
                </ol>
              </section>
            ))}
          </article>

          {/* uma folha por ficha, cada uma começando numa página nova */}
          {[...secoes.values()].flat().map((i) => (
            <FolhaFicha key={i.receita_id} className="print:break-before-page"
              nome={nomeDo(i)} codigo={i.receitas?.codigo ?? ""} casa={s.casa} emitido={emitido}
              linhas={porFicha.get(i.receita_id)!} custos={custos.get(i.receita_id)} />
          ))}
        </>
      )}
    </div>
  )
}

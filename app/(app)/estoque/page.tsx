import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { exigirCasa, podeVerCustos } from "@/lib/sessao"
import { dataCurta, dataHora, numero, reais } from "@/lib/formato"
import { CopiarPedido } from "@/components/copiar-pedido"
import { BotaoEmitirPedido } from "@/components/botao-emitir-pedido"
import { marcarPedidoEmitido } from "./actions"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { LogoCasa } from "@/components/logo-casa"

export const metadata: Metadata = { title: "Estoque" }

type Linha = {
  insumo_id: string; insumo: string; grupo: string; unidade_compra: string; conteudo: number | null; estoque_minimo: number
  deposito: number | null; bar: number | null; atual: number | null; data_contagem: string | null; pedir: number; valor_estimado: number | null
}
type Melhor = { insumo_id: string; fornecedor: string; compras: number; fornecedores: number; preco_unidade_compra: number | null; economia_pct: number | null }

const COMPRAS_RANKING = 10
const COLUNAS = "md:grid-cols-[minmax(0,1.1fr)_4.5rem_7rem_4.5rem_5rem_minmax(0,1fr)_6.5rem] print:grid-cols-[minmax(0,1.1fr)_3.5rem_5.5rem_3.5rem_4rem_minmax(0,1fr)_5rem]"
const SEM_FORNECEDOR = "Sem histórico de fornecedor"

export default async function PedidoSemana({ searchParams }: { searchParams: Promise<{ ver?: string; contagem?: string; agrupar?: string }> }) {
  const s = await exigirCasa()
  if (s.papel === "contagem") redirect("/estoque/contagem")
  const custos = podeVerCustos(s)
  const { ver, contagem, agrupar } = await searchParams
  const todos = ver === "todos"
  const porFornecedor = agrupar === "fornecedor"
  const supabase = await createClient()
  const [pedido, ranking, contagens, situacaoR] = await Promise.all([
    supabase.rpc("pedido_semanal", { p_estab: s.casa.id }),
    // melhor fornecedor (0020); sem a migração, a coluna fica vazia
    supabase.rpc("melhores_fornecedores_estoque", { p_estab: s.casa.id, p_compras: COMPRAS_RANKING }),
    // última contagem com responsável e hora (0023)
    supabase.rpc("ultimas_contagens", { p_estab: s.casa.id, p_limite: 1 }),
    // pedido pendente ou emitido (0027)
    supabase.rpc("situacao_pedido_estoque", { p_estab: s.casa.id }),
  ])
  const situacao = situacaoR.error ? null
    : ((situacaoR.data ?? []) as { contagem_id: string; emitido_em: string | null; emitido_por: string | null }[])[0] ?? null
  const emitido = !!situacao?.emitido_em
  if (pedido.error) return <p className="text-sm text-muted-foreground">O controle de estoque ainda não está ativo nesta base (migração 0019).</p>
  const linhas = (pedido.data ?? []) as Linha[]
  const melhor = new Map(((ranking.data ?? []) as Melhor[]).map((m) => [m.insumo_id, m]))
  const aPedir = linhas.filter((l) => Number(l.pedir) > 0)
  const visiveis = todos ? linhas : aPedir
  const grupoDe = (l: Linha) => (porFornecedor ? melhor.get(l.insumo_id)?.fornecedor ?? SEM_FORNECEDOR : l.grupo)
  const grupos = [...new Set(visiveis.map(grupoDe))].sort((a, b) => (a === SEM_FORNECEDOR ? 1 : b === SEM_FORNECEDOR ? -1 : a.localeCompare(b, "pt-BR")))
  const total = aPedir.reduce((a, l) => a + Number(l.valor_estimado ?? 0), 0)
  const semValor = aPedir.filter((l) => l.valor_estimado == null).length
  const ultima = linhas.map((l) => l.data_contagem).filter((d): d is string => !!d).sort().at(-1) ?? null
  const ult = ((contagens.data ?? []) as { feita_em: string; responsavel: string }[])[0]
  // "17/10/2026 às 14:32 · por Éder" (sem a migração 0023: só a data)
  const textoUltima = ult ? `${dataHora(ult.feita_em).replace(", ", " às ")} · por ${ult.responsavel}` : ultima ? dataCurta(ultima) : null
  const hoje = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date())
  const texto = [
    `*Pedido de compra · ${s.casa.nome}* · ${hoje}`,
    ...(textoUltima ? [`Última contagem: ${textoUltima}`] : []),
    ...[...new Set(aPedir.map(grupoDe))].flatMap((g) => [
      "",
      `*${porFornecedor ? g : g.split(" › ").at(-1)}*`,
      ...aPedir.filter((l) => grupoDe(l) === g).map((l) => {
        const m = melhor.get(l.insumo_id)
        return `- ${numero(l.pedir)} ${l.unidade_compra} · ${l.insumo}${!porFornecedor && m ? ` (melhor: ${m.fornecedor})` : ""}`
      }),
    ]),
  ].join("\n")
  const link = (mudar: { ver?: string; agrupar?: string }) => {
    const p = new URLSearchParams()
    const v = mudar.ver ?? (todos ? "todos" : ""), a = mudar.agrupar ?? (porFornecedor ? "fornecedor" : "")
    if (v) p.set("ver", v)
    if (a) p.set("agrupar", a)
    const qs = p.toString()
    return qs ? `/estoque?${qs}` : "/estoque"
  }
  const chip = (ativo: boolean) => cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3", ativo ? "border-foreground bg-foreground text-background" : "hover:bg-muted")

  if (!linhas.length) {
    return (
      <div className="grid gap-2 rounded-xl border p-6 text-center text-sm text-muted-foreground">
        <p>Nenhum item controlado nesta casa ainda.</p>
        {custos ? <p><Link href="/estoque/itens" className="underline">Cadastre os itens e o estoque mínimo</Link> para montar o pedido.</p> : null}
      </div>
    )
  }

  // vermelho enquanto o pedido não foi emitido; verde depois de emitir o PDF
  const pilula = (n: number) => cn("rounded-full px-2 py-0.5 font-semibold tabular-nums", n <= 0 ? "bg-neutro-fundo text-neutro" : emitido ? "bg-queda-fundo text-queda" : "bg-alta-fundo text-alta")

  return (
    <div className="grid gap-3 print:gap-2 print:text-[10.5px]">
      {/* cabeçalho do PDF */}
      <header className="hidden border-b pb-2 print:block">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <LogoCasa url={s.casa.logo} nome={s.casa.nome} className="h-12" />
            <h1 className="text-lg font-semibold">Pedido de compra · {s.casa.nome}</h1>
          </div>
          <span className="text-muted-foreground">MISEO · {dataHora(new Date().toISOString())}</span>
        </div>
        <p className="text-muted-foreground">
          {aPedir.length} {aPedir.length === 1 ? "item" : "itens"} para pedir
          {custos && aPedir.length ? ` · estimado ${reais(total)}${semValor ? ` (+${semValor} sem preço)` : ""}` : ""}
          {" · "}pedir = estoque mínimo − última contagem{textoUltima ? ` (${textoUltima})` : ""}
          {" · "}melhor fornecedor = menor preço médio nas últimas {COMPRAS_RANKING} compras
          {porFornecedor ? " · agrupado por fornecedor" : ""}
        </p>
      </header>

      {situacao && aPedir.length ? (
        <p role="status" className={cn("flex flex-wrap items-center gap-x-2 rounded-lg px-3 py-2 text-sm print:hidden", emitido ? "bg-queda-fundo text-queda" : "bg-alta-fundo text-alta")}>
          <b>{emitido ? "Pedido emitido" : "Pedido pendente"}</b>
          <span>
            {emitido
              ? `PDF emitido em ${dataHora(situacao.emitido_em).replace(", ", " às ")} por ${situacao.emitido_por} · enviado aos fornecedores`
              : "Contagem finalizada e pedido ainda não emitido. Confira e clique em Emitir PDF para enviar aos fornecedores."}
          </span>
        </p>
      ) : null}
      {contagem === "ok" ? (
        <p role="status" className="rounded-lg bg-queda-fundo px-3 py-2 text-sm text-queda print:hidden">Contagem salva. O pedido abaixo já usa os números novos.</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="text-sm">
          <b className={cn("text-lg tabular-nums", aPedir.length && !emitido ? "text-alta" : "text-queda")}>{aPedir.length}</b>{" "}
          {aPedir.length === 1 ? "item para pedir" : "itens para pedir"}
          {custos && aPedir.length ? (
            <> · estimado <b className="tabular-nums">{reais(total)}</b>{semValor ? <span className="text-muted-foreground"> (+{semValor} sem preço)</span> : null}</>
          ) : null}
          <div className="text-xs text-muted-foreground">
            Pedir = estoque mínimo − última contagem (depósito + bar){textoUltima ? <> · última contagem <b className="text-foreground">{textoUltima}</b></> : " · ainda sem contagem"}
            {" · "}melhor fornecedor pelas últimas {COMPRAS_RANKING} compras
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/estoque/contagem" className={buttonVariants({ variant: "outline", className: "h-11 px-4" })}>Nova contagem</Link>
          {aPedir.length ? <CopiarPedido texto={texto} /> : null}
          <BotaoEmitirPedido contagemId={situacao?.contagem_id ?? null} acao={marcarPedidoEmitido} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-sm print:hidden">
        <Link href={link({ ver: "" })} aria-current={!todos ? "page" : undefined} className={chip(!todos)}>
          Só o que pedir <span className="tabular-nums opacity-70">{aPedir.length}</span>
        </Link>
        <Link href={link({ ver: "todos" })} aria-current={todos ? "page" : undefined} className={chip(todos)}>
          Todos os itens <span className="tabular-nums opacity-70">{linhas.length}</span>
        </Link>
        <span className="ml-2 text-muted-foreground">Agrupar por:</span>
        <Link href={link({ agrupar: "" })} aria-current={!porFornecedor ? "page" : undefined} className={chip(!porFornecedor)}>Categoria</Link>
        <Link href={link({ agrupar: "fornecedor" })} aria-current={porFornecedor ? "page" : undefined} className={chip(porFornecedor)}>Melhor fornecedor</Link>
      </div>
      {visiveis.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-queda">Tudo acima do mínimo. Nada para pedir.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <div className={cn("hidden gap-3 border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground md:grid print:grid print:gap-2 print:px-2 print:py-1", COLUNAS)}>
            <span>Item</span>
            <span className="text-right">Mínimo</span>
            <span className="text-right">Atual (dep. + bar)</span>
            <span className="text-right">Pedir</span>
            <span>Unidade</span>
            <span>{porFornecedor ? "Fornecedor" : "Melhor fornecedor"}</span>
            <span className="text-right">{custos ? "Valor estimado" : ""}</span>
          </div>
          {grupos.map((g) => (
            <div key={g} className="break-inside-avoid-page">
              <div className="border-b bg-muted/30 px-4 py-1.5 text-xs font-semibold print:px-2 print:py-1">{g}</div>
              <ul className="divide-y border-b">
                {visiveis.filter((l) => grupoDe(l) === g).map((l) => {
                  const pedir = Number(l.pedir)
                  const atual = l.atual == null ? null : `${numero(l.atual)}`
                  const m = melhor.get(l.insumo_id)
                  const forn = m ? (
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">{m.fornecedor}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {custos && m.preco_unidade_compra != null ? `${reais(m.preco_unidade_compra)}/${l.unidade_compra}` : `${m.compras} de ${COMPRAS_RANKING} compras`}
                        {custos && m.economia_pct ? ` · ${numero(m.economia_pct)}% abaixo do pior` : ""}
                        {m.fornecedores === 1 ? " · único fornecedor" : ""}
                      </span>
                    </span>
                  ) : <span className="text-xs text-muted-foreground">sem histórico</span>
                  return (
                    <li key={l.insumo_id} className={cn("grid gap-1 px-4 py-2.5 md:items-center md:gap-3 print:grid print:items-center print:gap-2 print:px-2 print:py-1 break-inside-avoid", COLUNAS)}>
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <span className="min-w-0 truncate font-medium">{l.insumo}</span>
                        <span className={cn("shrink-0 text-xs md:hidden print:hidden", pilula(pedir))}>pedir {numero(pedir)} {l.unidade_compra}</span>
                      </div>
                      <div className="grid gap-0.5 text-xs tabular-nums text-muted-foreground md:hidden print:hidden">
                        <span>
                          mínimo {numero(l.estoque_minimo)} · atual {atual == null ? "sem contagem" : `${atual} (${numero(l.deposito)} + ${numero(l.bar)})`}
                          {custos && l.valor_estimado != null && pedir > 0 ? ` · ${reais(l.valor_estimado)}` : ""}
                        </span>
                        {!porFornecedor && m ? <span>Melhor: <b className="text-foreground">{m.fornecedor}</b>{custos && m.preco_unidade_compra != null ? ` · ${reais(m.preco_unidade_compra)}/${l.unidade_compra}` : ""}</span> : null}
                      </div>
                      <span className="hidden text-right tabular-nums md:block print:block">{numero(l.estoque_minimo)}</span>
                      <span className="hidden text-right tabular-nums md:block print:block">
                        {atual == null ? <span className="text-xs text-muted-foreground">sem contagem</span>
                          : <>{atual} <span className="text-xs text-muted-foreground">({numero(l.deposito)} + {numero(l.bar)})</span></>}
                      </span>
                      <span className="hidden text-right text-sm md:block print:block"><span className={pilula(pedir)}>{numero(pedir)}</span></span>
                      <span className="hidden text-sm text-muted-foreground md:block print:block">{l.unidade_compra}</span>
                      <span className="hidden min-w-0 text-sm md:block print:block">{forn}</span>
                      <span className="hidden text-right tabular-nums md:block print:block">{custos && l.valor_estimado != null && pedir > 0 ? reais(l.valor_estimado) : ""}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      <p className="hidden text-xs text-muted-foreground print:block">
        Pedido gerado pelo MISEO a partir da contagem de estoque e do estoque mínimo da casa.
      </p>
    </div>
  )
}

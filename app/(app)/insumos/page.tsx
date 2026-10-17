import type { Metadata } from "next"
import Link from "next/link"
import { SlidersHorizontal } from "lucide-react"
import { exigirCustos } from "@/lib/sessao"
import { custoPorUnidade, dataCurta, nomeMes, ultimosMeses } from "@/lib/formato"
import { SeloIndicador } from "@/components/indicador-preco"
import { BadgeVariacao } from "@/components/variacao"
import { COR_TODOS, CORES_STATUS } from "@/components/status-preco"
import { Entrada, Selecao } from "@/components/campos"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AvisoAlertas } from "@/components/aviso-alertas"
import { emAlerta } from "@/lib/dados"
import { BASES, carregarInsumos, FILTROS, ORDENS, type Base, type Ordem, type ParamsInsumos } from "./dados"

export const metadata: Metadata = { title: "Insumos" }

const COLUNAS = "sm:grid-cols-[minmax(0,1fr)_9rem_8.5rem_8.5rem_5.5rem]"

export default async function PaginaInsumos({ searchParams }: { searchParams: Promise<ParamsInsumos> }) {
  const s = await exigirCustos()
  const { q, categoria, filtro, ordem, base, uso, cats, nomes, variacoes, indicadores, mes, insumos, contagem, erro } =
    await carregarInsumos(s.casa.id, await searchParams)

  const link = (destino: string, mudar: Partial<ParamsInsumos> = {}) => {
    const p = new URLSearchParams()
    const final = { q, categoria, variacao: filtro, ordem: ordem === "nome" ? "" : ordem, mes, base: base === "mes" ? "" : base, uso, ...mudar }
    for (const [k, v] of Object.entries(final)) if (v) p.set(k, v)
    const qs = p.toString()
    return qs ? `${destino}?${qs}` : destino
  }
  const mesRef = indicadores ? [...indicadores.values()][0] : undefined
  const nomeDoMes = nomeMes(mesRef?.mes ?? "")
  const filtrosAtivos = [categoria, ordem !== "nome" ? ordem : "", mes, uso].filter(Boolean).length

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Insumos</h1>
        <div className="flex flex-wrap gap-2">
          <Link href={link("/insumos/relatorio")} className={buttonVariants({ variant: "outline", className: "hidden h-11 px-4 sm:inline-flex" })}>PDF</Link>
          <Link href="/pendencias/notas" className={buttonVariants({ variant: "outline", className: "hidden h-11 px-4 sm:inline-flex" })}>Importar nota</Link>
          <Link href="/insumos/novo" className={buttonVariants({ className: "h-11 px-4" })}>Novo insumo</Link>
        </div>
      </div>

      <AvisoAlertas quantidade={[...variacoes.values()].filter(emAlerta).length} um="insumo subiu" varios="insumos subiram" ancora="insumos" />

      <form className="grid gap-2" role="search">
        <div className="flex gap-2">
          <Entrada name="q" defaultValue={q} placeholder="Buscar insumo por nome ou código" aria-label="Buscar insumo" className="h-11 flex-1 text-base" />
          <Button type="submit" className="h-11 px-4">Buscar</Button>
        </div>
        <details className="group rounded-xl border px-3 py-1.5">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium">
            <SlidersHorizontal className="size-4" aria-hidden /> Filtros
            {filtrosAtivos ? <span className="rounded-full bg-foreground px-1.5 text-xs text-background">{filtrosAtivos}</span> : null}
            <span className="ml-auto truncate text-xs font-normal text-muted-foreground group-open:hidden">{filtrosAtivos ? [uso ? "só usados em fichas" : "", categoria ? nomes.get(categoria) : "", ordem !== "nome" ? ORDENS[ordem] : "", mes ? `mês ${mes}` : ""].filter(Boolean).join(" · ") : "categoria, ordem, mês, uso"}</span>
          </summary>
          <div className="grid gap-2 pb-2 pt-1 sm:grid-cols-2 lg:grid-cols-4">
            <Selecao name="categoria" defaultValue={categoria} aria-label="Categoria" className="h-11">
              <option value="">Todas as categorias</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{nomes.get(c.id)}</option>)}
            </Selecao>
            <Selecao name="ordem" defaultValue={ordem} aria-label="Ordenar por" className="h-11">
              {(Object.keys(ORDENS) as Ordem[]).map((o) => <option key={o} value={o}>Ordenar: {ORDENS[o]}</option>)}
            </Selecao>
            <Selecao name="mes" defaultValue={mes} aria-label="Mês do comparativo mensal" className="h-11">
              {ultimosMeses(12).map((m, k) => (
                <option key={m.valor} value={k === 0 ? "" : m.valor}>Mês: {m.rotulo}{k === 0 ? " (atual)" : ""}</option>
              ))}
            </Selecao>
            <Selecao name="uso" defaultValue={uso} aria-label="Uso" className="h-11">
              <option value="">Todos os insumos</option>
              <option value="fichas">Só os usados em fichas e preparos</option>
            </Selecao>
          </div>
          {filtro ? <input type="hidden" name="variacao" value={filtro} /> : null}
          {base !== "mes" ? <input type="hidden" name="base" value={base} /> : null}
        </details>
      </form>

      {indicadores ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Comparar:</span>
          {(Object.keys(BASES) as Base[]).map((b) => (
            <Link key={b} href={link("/insumos", { base: b === "mes" ? "" : b })} aria-current={base === b ? "page" : undefined}
              className={cn("inline-flex min-h-9 items-center rounded-full border px-3", base === b ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}>
              {b === "mes" ? `${nomeDoMes} × mês anterior` : BASES[b].rotulo}
            </Link>
          ))}
        </div>
      ) : null}

      <nav aria-label="Filtrar por variação de custo" className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => {
          const ativo = filtro === f.valor
          const n = contagem.get(f.valor) ?? 0
          const cor = f.valor ? CORES_STATUS[f.valor] : ativo ? COR_TODOS : null
          return (
            <Link key={f.valor || "todos"} href={link("/insumos", { variacao: f.valor })} aria-current={ativo ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3 text-sm font-semibold transition-shadow",
                cor ? "" : "border-border bg-background text-foreground hover:bg-muted",
                ativo ? "shadow-sm" : cor ? "border-transparent hover:shadow-sm" : "hover:shadow-sm",
              )}
              style={cor ? { color: cor.texto, backgroundColor: cor.fundo, borderColor: ativo ? cor.texto : "transparent" } : undefined}>
              {f.rotulo}
              <span className="tabular-nums text-xs opacity-80">{n}</span>
            </Link>
          )
        })}
      </nav>
      {indicadores ? (
        <p className="-mt-1 text-xs text-muted-foreground">
          Subiram, caíram e estáveis: {base === "mes" ? `média de ${nomeDoMes}${mesRef?.mes_encerrado === false ? " (mês em andamento)" : ""} contra a média do mês anterior` : BASES.compra.explica}, em {s.casa.nome}.
          {" "}Só compras validadas; preço de referência não entra na comparação.
        </p>
      ) : null}

      {erro ? <p className="text-sm text-destructive">Não foi possível carregar os insumos.</p> : null}
      {insumos.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">Nenhum insumo encontrado.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          {indicadores ? (
            <div className={cn("hidden gap-3 border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground sm:grid", COLUNAS)}>
              <span>Insumo</span>
              <span className="text-right">Preço atual</span>
              <span className="text-right" title="Média do mês contra a média do mês anterior">{nomeDoMes} × anterior</span>
              <span className="text-right" title="Última compra validada contra a anterior">Última × anterior</span>
              <span className="text-right">Compra</span>
            </div>
          ) : null}
          <ul className="divide-y">
            {insumos.map((i) => {
              const v = variacoes.get(i.id)
              const ind = indicadores?.get(i.id)
              if (!indicadores) {
                // sem a migração 0012: linha antiga
                return (
                  <li key={i.id}>
                    <Link href={`/insumos/${i.id}`} className="grid gap-1 px-4 py-3 hover:bg-muted/50 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="min-w-0 font-medium">{i.nome}</div>
                      <span className="inline-flex flex-wrap items-center gap-2 sm:justify-end">
                        {v ? <span className="font-medium tabular-nums">{custoPorUnidade(v.custo_atual, i.dimensao)}</span> : null}
                        <BadgeVariacao sinal={v?.sinal} pct={v?.variacao_pct} temPreco={!!v} />
                      </span>
                    </Link>
                  </li>
                )
              }
              const referencia = !!ind?.custo_oficial_referencia
              const custo = ind?.ultimo_preco ?? ind?.custo_oficial ?? null
              return (
                <li key={i.id}>
                  <Link href={link(`/insumos/${i.id}`, {})}
                    className={cn("grid gap-1.5 px-4 py-3 hover:bg-muted/50 sm:items-center sm:gap-3", COLUNAS)}>
                    {/* celular: nome e preço na mesma linha */}
                    <div className="flex min-w-0 items-baseline justify-between gap-3 sm:block">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{i.nome}{!i.ativo && <span className="text-xs font-normal text-muted-foreground"> (inativo)</span>}</div>
                        <div className="hidden text-xs text-muted-foreground sm:block">{i.codigo}{i.categoria_id ? ` · ${nomes.get(i.categoria_id)}` : ""}</div>
                      </div>
                      <span className="shrink-0 text-right font-semibold tabular-nums sm:hidden">
                        {custo != null ? custoPorUnidade(custo, i.dimensao) : <span className="font-normal text-muted-foreground">sem preço</span>}
                        {referencia ? <span className="ml-1 rounded border px-1 text-[10px] font-normal text-muted-foreground">referência</span> : null}
                      </span>
                    </div>
                    <span className="hidden text-right tabular-nums sm:block">
                      <span className="font-semibold">{custo != null ? custoPorUnidade(custo, i.dimensao) : <span className="font-normal text-muted-foreground">—</span>}</span>
                      {referencia ? <span className="block text-[11px] text-muted-foreground">preço de referência</span> : null}
                    </span>
                    <div className="flex flex-wrap gap-1.5 sm:contents">
                      <span className="sm:text-right"><SeloIndicador status={referencia ? "sem_base" : ind?.status_mensal ?? "sem_base"} pct={ind?.variacao_mensal_pct} rotulo="Mês" /></span>
                      <span className="sm:text-right"><SeloIndicador status={ind?.status_ultima ?? "sem_preco"} pct={ind?.variacao_ultima_pct} rotulo="Compra" /></span>
                    </div>
                    <span className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">
                      {ind?.data_ultima_compra ? dataCurta(ind.data_ultima_compra) : referencia ? "referência" : "—"}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

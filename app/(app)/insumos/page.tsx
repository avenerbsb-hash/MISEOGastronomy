import type { Metadata } from "next"
import Link from "next/link"
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
import { carregarInsumos, FILTROS, ORDENS, type Ordem, type ParamsInsumos } from "./dados"

export const metadata: Metadata = { title: "Insumos" }

export default async function PaginaInsumos({ searchParams }: { searchParams: Promise<ParamsInsumos> }) {
  const s = await exigirCustos()
  const { q, categoria, filtro, ordem, cats, nomes, variacoes, indicadores, mes, insumos, contagem, erro } =
    await carregarInsumos(s.casa.id, await searchParams)

  const link = (base: string, mudar: Partial<ParamsInsumos> = {}) => {
    const p = new URLSearchParams()
    const final = { q, categoria, variacao: filtro, ordem: ordem === "nome" ? "" : ordem, mes, ...mudar }
    for (const [k, v] of Object.entries(final)) if (v) p.set(k, v)
    const qs = p.toString()
    return qs ? `${base}?${qs}` : base
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Insumos</h1>
          <p className="text-sm text-muted-foreground">Custo da última compra validada em {s.casa.nome}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={link("/insumos/relatorio")} className={buttonVariants({ variant: "outline", className: "h-10 px-4" })}>Relatório PDF</Link>
          <Link href="/pendencias/notas" className={buttonVariants({ variant: "outline", className: "h-10 px-4" })}>Importar nota (XML)</Link>
          <Link href="/insumos/novo" className={buttonVariants({ className: "h-10 px-4" })}>Novo insumo</Link>
        </div>
      </div>

      <AvisoAlertas quantidade={[...variacoes.values()].filter(emAlerta).length} um="insumo subiu" varios="insumos subiram" ancora="insumos" />

      <form className="grid gap-2 sm:grid-cols-[1fr_14rem_12rem_11rem_auto]" role="search">
        <Entrada name="q" defaultValue={q} placeholder="Buscar por nome ou código" aria-label="Buscar" />
        <Selecao name="categoria" defaultValue={categoria} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{nomes.get(c.id)}</option>
          ))}
        </Selecao>
        <Selecao name="ordem" defaultValue={ordem} aria-label="Ordenar por">
          {(Object.keys(ORDENS) as Ordem[]).map((o) => (
            <option key={o} value={o}>Ordenar: {ORDENS[o]}</option>
          ))}
        </Selecao>
        <Selecao name="mes" defaultValue={mes} aria-label="Mês da tendência mensal">
          {ultimosMeses(12).map((m, k) => (
            <option key={m.valor} value={k === 0 ? "" : m.valor}>Mês: {m.rotulo}{k === 0 ? " (atual)" : ""}</option>
          ))}
        </Selecao>
        {filtro ? <input type="hidden" name="variacao" value={filtro} /> : null}
        <Button type="submit" variant="outline" className="h-10 px-4">Aplicar</Button>
      </form>

      <nav aria-label="Filtrar por variação de custo" className="-mt-1 flex flex-wrap gap-1.5">
        {FILTROS.map((f) => {
          const ativo = filtro === f.valor
          const n = contagem.get(f.valor) ?? 0
          // Mesma cor selecionado ou não; a seleção ganha borda forte. "Todos" selecionado = preto.
          const cor = f.valor ? CORES_STATUS[f.valor] : ativo ? COR_TODOS : null
          return (
            <Link
              key={f.valor || "todos"}
              href={link("/insumos", { variacao: f.valor })}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-sm font-medium transition-shadow",
                cor ? "" : "border-border bg-background text-foreground hover:bg-muted",
                ativo ? "shadow-sm" : cor ? "border-transparent hover:shadow-sm" : "hover:shadow-sm",
              )}
              style={cor ? { color: cor.texto, backgroundColor: cor.fundo, borderColor: ativo ? cor.texto : "transparent" } : undefined}
            >
              {f.rotulo}
              <span className="tabular-nums text-xs font-semibold opacity-80">{n}</span>
            </Link>
          )
        })}
      </nav>

      {erro ? <p className="text-sm text-destructive">Não foi possível carregar os insumos.</p> : null}
      {insumos.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">Nenhum insumo encontrado.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          {indicadores ? (
            <div className="hidden grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_8.5rem_6rem] gap-3 border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground sm:grid">
              <span>Insumo</span>
              <span className="text-right">Última compra</span>
              <span className="text-right" title="Variação entre as duas últimas compras validadas">Variação da compra</span>
              <span className="text-right" title="Média ponderada do mês contra o mês anterior">
                Tendência {nomeMes([...indicadores.values()][0]?.mes ?? "")}{[...indicadores.values()][0]?.mes_encerrado === false ? "*" : ""}
              </span>
              <span className="text-right">Data</span>
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
                      <div className="min-w-0">
                        <div className="font-medium">{i.nome} {!i.ativo && <span className="text-xs font-normal text-muted-foreground">(inativo)</span>}</div>
                        <div className="text-xs text-muted-foreground">{i.codigo}{i.categoria_id ? ` · ${nomes.get(i.categoria_id)}` : ""}</div>
                      </div>
                      <div className="grid gap-0.5 sm:justify-items-end">
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {v ? <span className="font-medium tabular-nums text-foreground">{custoPorUnidade(v.custo_atual, i.dimensao)}</span> : null}
                          <BadgeVariacao sinal={v?.sinal} pct={v?.variacao_pct} temPreco={!!v} />
                        </span>
                        <span className="text-xs text-muted-foreground">{v ? `compra de ${dataCurta(v.data_referencia)} · ${s.casa.nome}` : `nesta casa · ${s.casa.nome}`}</span>
                      </div>
                    </Link>
                  </li>
                )
              }
              const custo = ind?.ultimo_preco ?? ind?.custo_oficial ?? null
              return (
                <li key={i.id}>
                  <Link href={`/insumos/${i.id}`}
                    className="grid gap-1.5 px-4 py-3 hover:bg-muted/50 sm:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_8.5rem_6rem] sm:items-center sm:gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{i.nome} {!i.ativo && <span className="text-xs font-normal text-muted-foreground">(inativo)</span>}</div>
                      <div className="text-xs text-muted-foreground">{i.codigo}{i.categoria_id ? ` · ${nomes.get(i.categoria_id)}` : ""}</div>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
                      <span className="font-medium tabular-nums">{custo != null ? custoPorUnidade(custo, i.dimensao) : <span className="text-sm font-normal text-muted-foreground">—</span>}</span>
                      {ind?.custo_oficial_referencia ? <span className="block text-[11px] text-muted-foreground">preço de referência</span> : null}
                      <span className="text-xs text-muted-foreground sm:hidden">{ind?.data_ultima_compra ? `compra de ${dataCurta(ind.data_ultima_compra)}` : ""}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:contents">
                      <span className="sm:text-right"><SeloIndicador status={ind?.status_ultima ?? "sem_preco"} pct={ind?.variacao_ultima_pct} rotulo="Compra" /></span>
                      <span className="sm:text-right"><SeloIndicador status={ind?.status_mensal ?? "sem_base"} pct={ind?.variacao_mensal_pct} rotulo="Mês" /></span>
                    </div>
                    <span className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">{ind?.data_ultima_compra ? dataCurta(ind.data_ultima_compra) : "—"}</span>
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

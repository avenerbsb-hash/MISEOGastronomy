import type { Metadata } from "next"
import Link from "next/link"
import { exigirCustos } from "@/lib/sessao"
import { custoPorUnidade } from "@/lib/formato"
import { Variacao } from "@/components/variacao"
import { Entrada, Selecao } from "@/components/campos"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { carregarInsumos, FILTROS, ORDENS, type Ordem, type ParamsInsumos } from "./dados"

export const metadata: Metadata = { title: "Insumos" }

export default async function PaginaInsumos({ searchParams }: { searchParams: Promise<ParamsInsumos> }) {
  const s = await exigirCustos()
  const { q, categoria, filtro, ordem, cats, nomes, variacoes, insumos, contagem, erro } =
    await carregarInsumos(s.casa.id, await searchParams)

  const link = (base: string, mudar: Partial<ParamsInsumos> = {}) => {
    const p = new URLSearchParams()
    const final = { q, categoria, variacao: filtro, ordem: ordem === "nome" ? "" : ordem, ...mudar }
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

      <form className="grid gap-2 sm:grid-cols-[1fr_16rem_14rem_auto]" role="search">
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
        {filtro ? <input type="hidden" name="variacao" value={filtro} /> : null}
        <Button type="submit" variant="outline" className="h-10 px-4">Aplicar</Button>
      </form>

      <nav aria-label="Filtrar por variação de custo" className="-mt-1 flex flex-wrap gap-1.5">
        {FILTROS.map((f) => {
          const ativo = filtro === f.valor
          const n = contagem.get(f.valor) ?? 0
          return (
            <Link
              key={f.valor || "todos"}
              href={link("/insumos", { variacao: f.valor })}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
                ativo ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                !ativo && f.valor === "subiu" && "text-red-700 dark:text-red-400",
                !ativo && f.valor === "caiu" && "text-emerald-700 dark:text-emerald-400",
              )}
            >
              {f.rotulo}
              <span className={cn("tabular-nums text-xs", ativo ? "opacity-80" : "text-muted-foreground")}>{n}</span>
            </Link>
          )
        })}
      </nav>

      {erro ? <p className="text-sm text-destructive">Não foi possível carregar os insumos.</p> : null}
      {insumos.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">Nenhum insumo encontrado.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {insumos.map((i) => {
            const v = variacoes.get(i.id)
            return (
              <li key={i.id}>
                <Link href={`/insumos/${i.id}`} className="grid gap-1 px-4 py-3 hover:bg-muted/50 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {i.nome} {!i.ativo && <span className="text-xs font-normal text-muted-foreground">(inativo)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {i.codigo}{i.categoria_id ? ` · ${nomes.get(i.categoria_id)}` : ""}
                    </div>
                  </div>
                  <div className="grid gap-0.5 sm:justify-items-end">
                    <span className="font-medium tabular-nums">
                      {v ? custoPorUnidade(v.custo_atual, i.dimensao) : <span className="text-sm font-normal text-muted-foreground">Sem preço nesta casa</span>}
                    </span>
                    {v ? <Variacao sinal={v.sinal} pct={v.variacao_pct} data={v.data_referencia} casa={s.casa.nome} /> : null}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

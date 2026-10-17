import type { Metadata } from "next"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { exigirCasa, podeVerCustos } from "@/lib/sessao"
import { dataCurta, numero, reais } from "@/lib/formato"
import { CopiarPedido } from "@/components/copiar-pedido"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Estoque" }

type Linha = {
  insumo_id: string; insumo: string; grupo: string; unidade_compra: string; conteudo: number | null; estoque_minimo: number
  deposito: number | null; bar: number | null; atual: number | null; data_contagem: string | null; pedir: number; valor_estimado: number | null
}

const COLUNAS = "md:grid-cols-[minmax(0,1fr)_5.5rem_8rem_5.5rem_6.5rem_7rem]"

export default async function PedidoSemana({ searchParams }: { searchParams: Promise<{ ver?: string; contagem?: string }> }) {
  const s = await exigirCasa()
  if (s.papel === "contagem") redirect("/estoque/contagem")
  const custos = podeVerCustos(s)
  const { ver, contagem } = await searchParams
  const todos = ver === "todos"
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("pedido_semanal", { p_estab: s.casa.id })
  if (error) return <p className="text-sm text-muted-foreground">O controle de estoque ainda não está ativo nesta base (migração 0019).</p>
  const linhas = (data ?? []) as Linha[]
  const aPedir = linhas.filter((l) => Number(l.pedir) > 0)
  const visiveis = todos ? linhas : aPedir
  const grupos = [...new Set(visiveis.map((l) => l.grupo))]
  const total = aPedir.reduce((a, l) => a + Number(l.valor_estimado ?? 0), 0)
  const semValor = aPedir.filter((l) => l.valor_estimado == null).length
  const ultima = linhas.map((l) => l.data_contagem).filter((d): d is string => !!d).sort().at(-1) ?? null
  const hoje = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date())
  const texto = [
    `Pedido ${s.casa.nome} · ${hoje}`,
    ...[...new Set(aPedir.map((l) => l.grupo))].flatMap((g) => [
      "",
      `*${g.split(" › ").at(-1)}*`,
      ...aPedir.filter((l) => l.grupo === g).map((l) => `- ${numero(l.pedir)} ${l.unidade_compra} · ${l.insumo}`),
    ]),
  ].join("\n")

  if (!linhas.length) {
    return (
      <div className="grid gap-2 rounded-xl border p-6 text-center text-sm text-muted-foreground">
        <p>Nenhum item controlado nesta casa ainda.</p>
        {custos ? <p><Link href="/estoque/itens" className="underline">Cadastre os itens e o estoque mínimo</Link> para montar o pedido.</p> : null}
      </div>
    )
  }

  const pilula = (n: number) => cn("rounded-full px-2 py-0.5 font-semibold tabular-nums", n > 0 ? "bg-alta-fundo text-alta" : "bg-neutro-fundo text-neutro")

  return (
    <div className="grid gap-3">
      {contagem === "ok" ? (
        <p role="status" className="rounded-lg bg-queda-fundo px-3 py-2 text-sm text-queda">Contagem salva. O pedido abaixo já usa os números novos.</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <b className={cn("text-lg tabular-nums", aPedir.length ? "text-alta" : "text-queda")}>{aPedir.length}</b>{" "}
          {aPedir.length === 1 ? "item para pedir" : "itens para pedir"}
          {custos && aPedir.length ? (
            <> · estimado <b className="tabular-nums">{reais(total)}</b>{semValor ? <span className="text-muted-foreground"> (+{semValor} sem preço)</span> : null}</>
          ) : null}
          <div className="text-xs text-muted-foreground">
            Pedir = estoque mínimo − última contagem (depósito + bar){ultima ? ` · última contagem ${dataCurta(ultima)}` : " · ainda sem contagem"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/estoque/contagem" className={buttonVariants({ variant: "outline", className: "h-11 px-4" })}>Nova contagem</Link>
          {aPedir.length ? <CopiarPedido texto={texto} /> : null}
        </div>
      </div>
      <nav aria-label="Mostrar" className="flex flex-wrap gap-1.5 text-sm">
        <Link href="/estoque" aria-current={!todos ? "page" : undefined}
          className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3", !todos ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}>
          Só o que pedir <span className="tabular-nums opacity-70">{aPedir.length}</span>
        </Link>
        <Link href="/estoque?ver=todos" aria-current={todos ? "page" : undefined}
          className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3", todos ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}>
          Todos os itens <span className="tabular-nums opacity-70">{linhas.length}</span>
        </Link>
      </nav>
      {visiveis.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-queda">Tudo acima do mínimo. Nada para pedir.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <div className={cn("hidden gap-3 border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground md:grid", COLUNAS)}>
            <span>Item</span>
            <span className="text-right">Mínimo</span>
            <span className="text-right">Atual (dep. + bar)</span>
            <span className="text-right">Pedir</span>
            <span>Unidade</span>
            <span className="text-right">{custos ? "Valor estimado" : ""}</span>
          </div>
          {grupos.map((g) => (
            <div key={g}>
              <div className="border-b bg-muted/30 px-4 py-1.5 text-xs font-semibold">{g}</div>
              <ul className="divide-y border-b">
                {visiveis.filter((l) => l.grupo === g).map((l) => {
                  const pedir = Number(l.pedir)
                  const atual = l.atual == null ? null : `${numero(l.atual)}`
                  return (
                    <li key={l.insumo_id} className={cn("grid gap-1 px-4 py-2.5 md:items-center md:gap-3", COLUNAS)}>
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <span className="min-w-0 truncate font-medium">{l.insumo}</span>
                        <span className={cn("shrink-0 text-xs md:hidden", pilula(pedir))}>pedir {numero(pedir)} {l.unidade_compra}</span>
                      </div>
                      <div className="text-xs tabular-nums text-muted-foreground md:hidden">
                        mínimo {numero(l.estoque_minimo)} · atual {atual == null ? "sem contagem" : `${atual} (${numero(l.deposito)} + ${numero(l.bar)})`}
                        {custos && l.valor_estimado != null && pedir > 0 ? ` · ${reais(l.valor_estimado)}` : ""}
                      </div>
                      <span className="hidden text-right tabular-nums md:block">{numero(l.estoque_minimo)}</span>
                      <span className="hidden text-right tabular-nums md:block">
                        {atual == null ? <span className="text-xs text-muted-foreground">sem contagem</span>
                          : <>{atual} <span className="text-xs text-muted-foreground">({numero(l.deposito)} + {numero(l.bar)})</span></>}
                      </span>
                      <span className="hidden text-right text-sm md:block"><span className={pilula(pedir)}>{numero(pedir)}</span></span>
                      <span className="hidden text-sm text-muted-foreground md:block">{l.unidade_compra}</span>
                      <span className="hidden text-right tabular-nums md:block">{custos && l.valor_estimado != null && pedir > 0 ? reais(l.valor_estimado) : ""}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

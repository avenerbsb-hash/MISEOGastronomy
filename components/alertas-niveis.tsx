import Link from "next/link"
import { percentual, reais } from "@/lib/formato"
import { pctPreciso } from "@/components/indicador-preco"
import { cn } from "@/lib/utils"

// Linha de alertas_fichas_niveis (migração 0026): tudo calculado no banco
export type AlertaNivel = {
  receita_id: string; item_id: string; produto: string; grupo: Grupo
  custo_antes: number | null; custo_hoje: number | null; variacao_pct: number | null
  preco: number | null; cmv_antes: number | null; cmv_hoje: number | null; variacao_cmv_pp: number | null; meta_pct: number
  cruzou_meta: boolean; nivel_custo: number; nivel_cmv: number; nivel: 1 | 2 | 3; insumos: string | null
}
export type Grupo = "drinks" | "comida" | "bebidas" | "outros"

export const NOMES_GRUPO: Record<Grupo, string> = { drinks: "Drinks", comida: "Pratos", bebidas: "Bebidas", outros: "Outros" }
export const NIVEIS = { 3: "Crítico", 2: "Alerta", 1: "Atenção" } as const
export const JANELAS = [30, 60, 90]

// Três tons de vermelho (alta = piora): crítico cheio, alerta forte, atenção leve
export function SeloNivel({ nivel }: { nivel: 1 | 2 | 3 }) {
  return (
    <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold",
      nivel === 3 ? "bg-alta text-white" : nivel === 2 ? "bg-alta-fundo text-alta" : "border border-alta/40 text-alta")}>
      {NIVEIS[nivel]}
    </span>
  )
}

// Por que a ficha entrou no alerta, a partir dos níveis que o banco marcou
export function motivos(a: AlertaNivel): string[] {
  const m: string[] = []
  if (a.nivel_custo > 0 && a.variacao_pct != null) m.push(`custo ${pctPreciso(a.variacao_pct)}`)
  if (a.cruzou_meta) m.push(`CMV passou da meta (${percentual(a.meta_pct)})`)
  else if (a.nivel_cmv > 0 && a.variacao_cmv_pp != null) m.push(`CMV +${String(a.variacao_cmv_pp).replace(".", ",")} p.p.`)
  return m
}

export function AlertasNiveis({ linhas, janela, nivel, grupo, erro }: {
  linhas: AlertaNivel[]; janela: number; nivel: number; grupo: string; erro: boolean
}) {
  const href = (m: { janela?: number; nivel?: number; grupo?: string }) => {
    const p = new URLSearchParams()
    const j = m.janela ?? janela, n = m.nivel ?? nivel, g = m.grupo ?? grupo
    if (j !== 30) p.set("janela", String(j))
    if (n) p.set("nivel", String(n))
    if (g) p.set("grupo", g)
    const qs = p.toString()
    return `/alertas${qs ? `?${qs}` : ""}#niveis`
  }
  const conta = (n: number) => linhas.filter((l) => l.nivel === n && (!grupo || l.grupo === grupo)).length
  const contaGrupo = (g: string) => linhas.filter((l) => l.grupo === g && (!nivel || l.nivel === nivel)).length
  const lista = linhas.filter((l) => (!nivel || l.nivel === nivel) && (!grupo || l.grupo === grupo))
  const chip = (ativo: boolean) => cn("inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm", ativo ? "border-foreground bg-foreground text-background" : "hover:bg-muted")

  return (
    <section id="niveis" className="grid scroll-mt-20 gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Fichas do cardápio em alerta</h2>
          <p className="text-sm text-muted-foreground">
            Hoje comparado com {janela} dias atrás (acumulado). Drinks e pratos têm limites menores ·{" "}
            <Link href="/casa#limites" className="underline">ajustar limites</Link>
          </p>
        </div>
        <nav className="flex gap-1.5" aria-label="Período">
          {JANELAS.map((j) => <Link key={j} href={href({ janela: j })} className={chip(j === janela)} aria-current={j === janela ? "page" : undefined}>{j} dias</Link>)}
        </nav>
      </div>

      {erro ? <p className="text-sm text-destructive">Os níveis de alerta ainda não estão ativos (migração 0026).</p> : (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Link href={href({ nivel: 0 })} className={chip(!nivel)}>Todos <span className="opacity-70">{conta(1) + conta(2) + conta(3)}</span></Link>
            {([3, 2, 1] as const).map((n) => (
              <Link key={n} href={href({ nivel: n })} className={chip(nivel === n)}>{NIVEIS[n]} <span className="opacity-70">{conta(n)}</span></Link>
            ))}
            <span className="mx-1 w-px self-stretch bg-border" aria-hidden />
            <Link href={href({ grupo: "" })} className={chip(!grupo)}>Todos os grupos</Link>
            {(Object.keys(NOMES_GRUPO) as Grupo[]).map((g) => (
              <Link key={g} href={href({ grupo: g })} className={chip(grupo === g)}>{NOMES_GRUPO[g]} <span className="opacity-70">{contaGrupo(g)}</span></Link>
            ))}
          </div>

          {lista.length ? (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Nível</th>
                    <th className="px-3 py-2">Ficha</th>
                    <th className="px-3 py-2 text-right">Custo antes → hoje</th>
                    <th className="px-3 py-2 text-right">CMV antes → hoje</th>
                    <th className="px-3 py-2">Motivo</th>
                    <th className="px-3 py-2">Insumos que subiram</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lista.map((a) => (
                    <tr key={a.receita_id} className="align-top hover:bg-muted/40">
                      <td className="px-3 py-2"><SeloNivel nivel={a.nivel} /></td>
                      <td className="px-3 py-2">
                        <Link href={`/fichas/${a.receita_id}`} className="font-medium hover:underline">{a.produto}</Link>
                        <span className="block text-xs text-muted-foreground">{NOMES_GRUPO[a.grupo]}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        <span className="text-muted-foreground">{reais(a.custo_antes)}</span> → {reais(a.custo_hoje)}
                        {a.variacao_pct != null ? (
                          <span className={cn("block text-xs font-semibold", Number(a.variacao_pct) > 0 ? "text-alta" : "text-queda")}>
                            {Number(a.variacao_pct) > 0 ? "▲" : "▼"} {pctPreciso(a.variacao_pct)}
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {a.cmv_hoje != null ? (
                          <>
                            <span className="text-muted-foreground">{percentual(a.cmv_antes)}</span> →{" "}
                            <span className={cn("font-semibold", Number(a.cmv_hoje) > Number(a.meta_pct) ? "text-alta" : "text-queda")}>{percentual(a.cmv_hoje)}</span>
                          </>
                        ) : <span className="text-xs text-muted-foreground">sem preço de venda</span>}
                      </td>
                      <td className="px-3 py-2 text-xs">{motivos(a).join(" · ")}</td>
                      <td className="max-w-64 px-3 py-2 text-xs text-muted-foreground">{a.insumos ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="rounded-xl border px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma ficha do cardápio neste filtro.</p>}
        </>
      )}
    </section>
  )
}

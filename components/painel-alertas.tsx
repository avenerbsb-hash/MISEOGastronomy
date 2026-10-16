import Link from "next/link"
import { DIAS_ALERTA, LIMITE_ALERTA, type AlertaFicha, type AlertaInsumo } from "@/lib/dados"
import { custoPorUnidade, dataCurta, percentual, reais } from "@/lib/formato"
import { BadgeVariacao } from "@/components/variacao"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// Tela de alertas de aumento: só exibe o que alertas_insumos / alertas_fichas calcularam no banco
export const PERIODOS = [30, 60, 90]
// CMV acima disto aparece em vermelho (mesmo limite da lista de fichas)
const CMV_ALERTA = 30

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export function PainelAlertas({ insumos, fichas, dias, casa, erro = false }: { insumos: AlertaInsumo[]; fichas: AlertaFicha[]; dias: number; casa: string; erro?: boolean }) {
  const finais = fichas.filter((f) => f.tipo === "final")
  const subprodutos = fichas.filter((f) => f.tipo === "subproduto")
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Alertas de aumento</h1>
          <p className="text-sm text-muted-foreground">
            Custos que subiram mais de {LIMITE_ALERTA}% em {casa}, com compra nos últimos {dias} dias
          </p>
        </div>
        <nav className="flex gap-1.5 text-sm" aria-label="Período">
          {PERIODOS.map((p) => (
            <Link key={p} href={p === DIAS_ALERTA ? "/alertas" : `/alertas?dias=${p}`}
              className={cn("rounded-full border px-3 py-1.5", p === dias && "border-foreground bg-foreground text-background")}>
              {p} dias
            </Link>
          ))}
        </nav>
      </div>

      {erro ? <p className="text-sm text-destructive">Não foi possível carregar os alertas.</p> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Resumo numero={insumos.length} rotulo={insumos.length === 1 ? "insumo subiu" : "insumos subiram"} href="#insumos" />
        <Resumo numero={finais.length} rotulo={finais.length === 1 ? "ficha técnica subiu" : "fichas técnicas subiram"} href="#fichas" />
        <Resumo numero={subprodutos.length} rotulo={subprodutos.length === 1 ? "subproduto subiu" : "subprodutos subiram"} href="#subprodutos" />
      </div>

      <Card id="insumos">
        <CardHeader>
          <CardTitle>Produto base (insumos)</CardTitle>
          <CardDescription>Último preço comparado com o anterior, e as fichas que usam o insumo (inclusive via subprodutos).</CardDescription>
        </CardHeader>
        <CardContent>
          {insumos.length === 0 ? <Vazio texto={`Nenhum insumo subiu mais de ${LIMITE_ALERTA}% nos últimos ${dias} dias.`} /> : (
            <ul className="divide-y rounded-xl border">
              {insumos.map((a) => (
                <li key={a.insumo_id} className="grid gap-1.5 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link href={`/insumos/${a.insumo_id}`} className="font-medium hover:underline">{a.insumo}</Link>
                    <BadgeVariacao sinal="vermelho" pct={a.variacao_pct} />
                    <span className="text-xs text-muted-foreground">compra de {dataCurta(a.data_referencia)}</span>
                  </div>
                  <div className="text-sm tabular-nums text-muted-foreground">
                    {custoPorUnidade(a.custo_anterior, a.unidade_base)} → <b className="text-foreground">{custoPorUnidade(a.custo_atual, a.unidade_base)}</b>
                  </div>
                  <div className="text-sm">
                    {a.qtd_fichas + a.qtd_subprodutos === 0 ? (
                      <span className="text-muted-foreground">Não é usado em nenhuma ficha aprovada.</span>
                    ) : (
                      <>
                        <span className="font-medium">
                          Afeta {[a.qtd_fichas ? plural(a.qtd_fichas, "ficha", "fichas") : "", a.qtd_subprodutos ? plural(a.qtd_subprodutos, "subproduto", "subprodutos") : ""].filter(Boolean).join(" e ")}:
                        </span>{" "}
                        <span className="inline-flex flex-wrap gap-1 align-middle">
                          {a.receitas.map((r) => (
                            <Link key={r.id} href={r.tipo === "final" ? `/fichas/${r.id}` : `/subprodutos/${r.id}`}
                              className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted">
                              {r.nome}{r.tipo === "subproduto" ? <span className="text-muted-foreground"> (sub)</span> : null}
                            </Link>
                          ))}
                        </span>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card id="fichas">
        <CardHeader>
          <CardTitle>Fichas técnicas</CardTitle>
          <CardDescription>Custo da porção antes e depois da última compra e, quando a ficha está no cardápio, o CMV.</CardDescription>
        </CardHeader>
        <CardContent>
          {finais.length === 0 ? <Vazio texto={`Nenhuma ficha técnica subiu mais de ${LIMITE_ALERTA}% nos últimos ${dias} dias.`} /> : <ListaFichas itens={finais} />}
        </CardContent>
      </Card>

      <Card id="subprodutos">
        <CardHeader>
          <CardTitle>Subprodutos</CardTitle>
          <CardDescription>Preparos de base (xaropes, cordiais, pré-batches…). A alta deles também chega às fichas que os usam.</CardDescription>
        </CardHeader>
        <CardContent>
          {subprodutos.length === 0 ? <Vazio texto={`Nenhum subproduto subiu mais de ${LIMITE_ALERTA}% nos últimos ${dias} dias.`} /> : <ListaFichas itens={subprodutos} />}
        </CardContent>
      </Card>
    </div>
  )
}

function Resumo({ numero, rotulo, href }: { numero: number; rotulo: string; href: string }) {
  return (
    <a href={href} className="rounded-xl border px-4 py-3 hover:bg-muted/50">
      <div className={cn("text-2xl font-semibold tabular-nums", numero > 0 && "text-[#DC2626]")}>{numero}</div>
      <div className="text-sm text-muted-foreground">{rotulo}</div>
    </a>
  )
}

function Vazio({ texto }: { texto: string }) {
  return <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{texto}</p>
}

function ListaFichas({ itens }: { itens: AlertaFicha[] }) {
  return (
    <ul className="divide-y rounded-xl border">
      {itens.map((f) => {
        const final = f.tipo === "final"
        const valor = (v: number) => (final ? reais(v) : custoPorUnidade(v, f.dimensao))
        return (
          <li key={f.receita_id} className="grid gap-1.5 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={final ? `/fichas/${f.receita_id}` : `/subprodutos/${f.receita_id}`} className="font-medium hover:underline">{f.nome}</Link>
              <BadgeVariacao sinal="vermelho" pct={f.variacao_pct} />
              <span className="text-xs text-muted-foreground">compra de {dataCurta(f.data_referencia)}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm tabular-nums text-muted-foreground">
              <span>Custo {valor(f.custo_anterior)} → <b className="text-foreground">{valor(f.custo_atual)}</b></span>
              {final && f.preco_venda != null ? (
                <span>
                  CMV {percentual(f.cmv_anterior_pct)} →{" "}
                  <b className={cn("text-foreground", Number(f.cmv_atual_pct) > CMV_ALERTA && "text-red-700 dark:text-red-400")}>{percentual(f.cmv_atual_pct)}</b>
                  {" "}· preço {reais(f.preco_venda)}
                </span>
              ) : final ? <span>Sem preço de venda nesta casa</span> : null}
            </div>
            {f.insumos ? <div className="text-xs text-muted-foreground">Subiu por: {f.insumos}</div> : null}
          </li>
        )
      })}
    </ul>
  )
}

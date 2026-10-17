import Link from "next/link"
import { DIAS_ALERTA, LIMITE_ALERTA, type AlertaFicha, type AlertaInsumo } from "@/lib/dados"
import { custoPorUnidade, dataCurta, percentual, reais } from "@/lib/formato"
import { BadgeVariacao } from "@/components/variacao"
import { cn } from "@/lib/utils"

// Tela de alertas de aumento: só exibe o que alertas_insumos / alertas_fichas calcularam no banco
export const PERIODOS = [30, 60, 90]

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
// colunas no computador
const COL_INSUMO = "md:grid-cols-[minmax(0,1.3fr)_6.5rem_6.5rem_6rem_5rem_minmax(0,1.5fr)]"
const COL_FICHA = "md:grid-cols-[minmax(0,1.5fr)_6.5rem_6.5rem_6rem_9rem_6rem]"

export function PainelAlertas({ insumos, fichas, dias, erro = false, meta = 30, uso = "" }: {
  insumos: AlertaInsumo[]; fichas: AlertaFicha[]; dias: number; casa?: string; erro?: boolean; meta?: number; uso?: string
}) {
  const finais = fichas.filter((f) => f.tipo === "final")
  const subprodutos = fichas.filter((f) => f.tipo === "subproduto")
  const usados = insumos.filter((a) => a.qtd_fichas + a.qtd_subprodutos > 0)
  // primeiro os que afetam fichas, depois os demais; dentro de cada grupo, a maior alta primeiro
  const ordenados = [...(uso === "fichas" ? usados : insumos)].sort((a, b) =>
    Number(b.qtd_fichas + b.qtd_subprodutos > 0) - Number(a.qtd_fichas + a.qtd_subprodutos > 0) || Number(b.variacao_pct) - Number(a.variacao_pct))
  const link = (mudar: { dias?: number; uso?: string }) => {
    const p = new URLSearchParams()
    const d = mudar.dias ?? dias, u = mudar.uso ?? uso
    if (d !== DIAS_ALERTA) p.set("dias", String(d))
    if (u) p.set("uso", u)
    const qs = p.toString()
    return qs ? `/alertas?${qs}` : "/alertas"
  }
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Alertas de aumento</h1>
          <p className="text-sm text-muted-foreground">Altas acima de {LIMITE_ALERTA}%, com compra nos últimos {dias} dias</p>
        </div>
        <nav className="flex gap-1.5 text-sm" aria-label="Período">
          {PERIODOS.map((p) => (
            <Link key={p} href={link({ dias: p })} aria-current={p === dias ? "page" : undefined}
              className={cn("inline-flex min-h-11 items-center rounded-full border px-3", p === dias ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}>
              {p} dias
            </Link>
          ))}
        </nav>
      </div>

      {erro ? <p className="text-sm text-destructive">Não foi possível carregar os alertas.</p> : null}

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Resumo numero={insumos.length} rotulo={insumos.length === 1 ? "insumo subiu" : "insumos subiram"} href="#insumos" />
        <Resumo numero={finais.length} rotulo={finais.length === 1 ? "ficha subiu" : "fichas subiram"} href="#fichas" />
        <Resumo numero={subprodutos.length} rotulo={subprodutos.length === 1 ? "preparo subiu" : "preparos subiram"} href="#subprodutos" />
      </div>

      <Secao id="insumos" titulo="Insumos" descricao="Última compra validada contra a anterior. Os que afetam fichas aparecem primeiro.">
        <div className="flex flex-wrap gap-1.5">
          <Link href={link({ uso: "" })} aria-current={!uso ? "page" : undefined}
            className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm", !uso ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}>
            Todos <span className="tabular-nums opacity-70">{insumos.length}</span>
          </Link>
          <Link href={link({ uso: "fichas" })} aria-current={uso === "fichas" ? "page" : undefined}
            className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm", uso === "fichas" ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}>
            Só os que afetam fichas <span className="tabular-nums opacity-70">{usados.length}</span>
          </Link>
        </div>
        {ordenados.length === 0 ? <Vazio texto={`Nenhum insumo subiu mais de ${LIMITE_ALERTA}% nos últimos ${dias} dias.`} /> : (
          <div className="overflow-hidden rounded-xl border">
            <Cabecalho colunas={COL_INSUMO} titulos={["Insumo", "Antes", "Agora", "Alta", "Compra", "Afeta"]} />
            <ul className="divide-y">
              {ordenados.map((a) => {
                const qtd = a.qtd_fichas + a.qtd_subprodutos
                const chips = a.receitas.slice(0, 3)
                return (
                  <li key={a.insumo_id} className={cn("grid gap-1 px-4 py-3 md:items-center md:gap-3", COL_INSUMO, !qtd && "bg-muted/30")}>
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <Link href={`/insumos/${a.insumo_id}`} className="min-w-0 truncate font-medium hover:underline">{a.insumo}</Link>
                      <span className="shrink-0 md:hidden"><BadgeVariacao sinal="vermelho" pct={a.variacao_pct} /></span>
                    </div>
                    {/* celular: antes → agora · data */}
                    <div className="text-sm tabular-nums text-muted-foreground md:hidden">
                      {custoPorUnidade(a.custo_anterior, a.unidade_base)} → <b className="text-foreground">{custoPorUnidade(a.custo_atual, a.unidade_base)}</b> · {dataCurta(a.data_referencia)}
                    </div>
                    <span className="hidden text-right text-sm tabular-nums text-muted-foreground md:block">{custoPorUnidade(a.custo_anterior, a.unidade_base)}</span>
                    <span className="hidden text-right text-sm font-semibold tabular-nums md:block">{custoPorUnidade(a.custo_atual, a.unidade_base)}</span>
                    <span className="hidden text-right md:block"><BadgeVariacao sinal="vermelho" pct={a.variacao_pct} /></span>
                    <span className="hidden text-right text-xs tabular-nums text-muted-foreground md:block">{dataCurta(a.data_referencia)}</span>
                    <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs">
                      {qtd === 0 ? <span className="text-muted-foreground">Não é usado em ficha aprovada</span> : (
                        <>
                          {chips.map((r) => (
                            <Link key={r.id} href={r.tipo === "final" ? `/fichas/${r.id}` : `/subprodutos/${r.id}`}
                              className="max-w-full truncate rounded-full border px-2 py-0.5 hover:bg-muted">
                              {r.nome}{r.tipo === "subproduto" ? <span className="text-muted-foreground"> (preparo)</span> : null}
                            </Link>
                          ))}
                          {a.receitas.length > chips.length ? (
                            <Link href={`/insumos/${a.insumo_id}`} className="text-muted-foreground underline">+{a.receitas.length - chips.length}</Link>
                          ) : null}
                          <span className="sr-only">{[a.qtd_fichas ? plural(a.qtd_fichas, "ficha", "fichas") : "", a.qtd_subprodutos ? plural(a.qtd_subprodutos, "preparo", "preparos") : ""].filter(Boolean).join(" e ")}</span>
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </Secao>

      <Secao id="fichas" titulo="Fichas técnicas" descricao={`Custo da porção antes e depois da última compra e o CMV (vermelho acima da meta de ${percentual(meta)}).`}>
        {finais.length === 0 ? <Vazio texto={`Nenhuma ficha técnica subiu mais de ${LIMITE_ALERTA}% nos últimos ${dias} dias.`} /> : <ListaFichas itens={finais} meta={meta} />}
      </Secao>

      <Secao id="subprodutos" titulo="Preparos e bases" descricao="Xaropes, cordiais, pré-batches… A alta deles também chega às fichas que os usam.">
        {subprodutos.length === 0 ? <Vazio texto={`Nenhum preparo subiu mais de ${LIMITE_ALERTA}% nos últimos ${dias} dias.`} /> : <ListaFichas itens={subprodutos} meta={meta} />}
      </Secao>
    </div>
  )
}

function Secao({ id, titulo, descricao, children }: { id: string; titulo: string; descricao: string; children: React.ReactNode }) {
  return (
    <section id={id} className="grid scroll-mt-20 gap-2">
      <div>
        <h2 className="text-base font-semibold">{titulo}</h2>
        <p className="text-sm text-muted-foreground">{descricao}</p>
      </div>
      {children}
    </section>
  )
}

function Cabecalho({ colunas, titulos }: { colunas: string; titulos: string[] }) {
  return (
    <div className={cn("hidden gap-3 border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground md:grid", colunas)}>
      {titulos.map((t, k) => <span key={t} className={k > 0 && k < titulos.length - (titulos[titulos.length - 1] === "Afeta" ? 1 : 0) ? "text-right" : ""}>{t}</span>)}
    </div>
  )
}

function Resumo({ numero, rotulo, href }: { numero: number; rotulo: string; href: string }) {
  return (
    <a href={href} className="grid min-h-11 rounded-xl border px-3 py-2.5 hover:bg-muted/50 sm:px-4 sm:py-3">
      <span className={cn("text-2xl font-semibold tabular-nums", numero > 0 && "text-alta")}>{numero}</span>
      <span className="text-xs text-muted-foreground sm:text-sm">{rotulo}</span>
    </a>
  )
}

function Vazio({ texto }: { texto: string }) {
  return <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{texto}</p>
}

function ListaFichas({ itens, meta }: { itens: AlertaFicha[]; meta: number }) {
  const final = itens[0]?.tipo === "final"
  return (
    <div className="overflow-hidden rounded-xl border">
      <Cabecalho colunas={COL_FICHA} titulos={final ? ["Ficha", "Antes", "Agora", "Alta", "CMV", "Preço"] : ["Preparo", "Antes", "Agora", "Alta", "", ""]} />
      <ul className="divide-y">
        {[...itens].sort((a, b) => Number(b.variacao_pct) - Number(a.variacao_pct)).map((f) => {
          const ehFinal = f.tipo === "final"
          const valor = (v: number) => (ehFinal ? reais(v) : custoPorUnidade(v, f.dimensao))
          const acima = Number(f.cmv_atual_pct) > meta
          const cmv = ehFinal && f.preco_venda != null ? (
            <span className="tabular-nums">
              <span className="text-muted-foreground">{percentual(f.cmv_anterior_pct)} → </span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", acima ? "bg-alta-fundo text-alta" : "bg-queda-fundo text-queda")}>{percentual(f.cmv_atual_pct)}</span>
            </span>
          ) : ehFinal ? <span className="text-xs text-muted-foreground">sem preço</span> : null
          return (
            <li key={f.receita_id} className={cn("grid gap-1 px-4 py-3 md:items-center md:gap-3", COL_FICHA)}>
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <Link href={ehFinal ? `/fichas/${f.receita_id}` : `/subprodutos/${f.receita_id}`} className="min-w-0 truncate font-medium hover:underline">{f.nome}</Link>
                  <span className="shrink-0 md:hidden"><BadgeVariacao sinal="vermelho" pct={f.variacao_pct} /></span>
                </div>
                {f.insumos ? <div className="truncate text-xs text-muted-foreground" title={f.insumos}>Subiu por: {f.insumos}</div> : null}
              </div>
              {/* celular */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums text-muted-foreground md:hidden">
                <span>{valor(f.custo_anterior)} → <b className="text-foreground">{valor(f.custo_atual)}</b></span>
                {cmv ? <span>CMV {cmv}</span> : null}
              </div>
              <span className="hidden text-right text-sm tabular-nums text-muted-foreground md:block">{valor(f.custo_anterior)}</span>
              <span className="hidden text-right text-sm font-semibold tabular-nums md:block">{valor(f.custo_atual)}</span>
              <span className="hidden text-right md:block"><BadgeVariacao sinal="vermelho" pct={f.variacao_pct} /></span>
              <span className="hidden text-right text-sm md:block">{cmv}</span>
              <span className="hidden text-right text-sm tabular-nums md:block">{ehFinal && f.preco_venda != null ? reais(f.preco_venda) : ""}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

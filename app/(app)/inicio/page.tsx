import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangle, BookOpen, Info, PackageX, PieChart, ShoppingCart, type LucideIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { alertasDaCasa, DIAS_ALERTA, historicoCusto, indicadoresDaCasa, variacoesDasReceitas } from "@/lib/dados"
import { custoPorUnidade, dataCurta, dataHora, hojeSP, nomeMes, percentual, reais, type Dimensao } from "@/lib/formato"
import { SeloIndicador, pctPreciso } from "@/components/indicador-preco"
import { Sparkline, tomDe, type Tom } from "@/components/sparkline"
import type { LinhaCmv } from "@/components/painel-cmv"
import type { Conferencia } from "@/components/conferencias"
import { cn } from "@/lib/utils"
import { SeloNivel, type AlertaNivel } from "@/components/alertas-niveis"
import { insumosEmFichas } from "../insumos/dados"

export const metadata: Metadata = { title: "Início" }

// Ponto semanal da casa e dos itens (serie_mercado_casa, migração 0024)
type Ponto = {
  tipo: "casa" | "item"; data: string; item_id: string | null; produto: string | null
  custo: number | null; preco: number | null; cmv_pct: number | null
  cmv_medio: number | null; itens_avaliados: number | null; itens_acima: number | null; conferencias_abertas: number | null
  insumos_sem_preco: number | null; indice_custo_fichas: number | null
  var_cmv_pp: number | null; var_pct: number | null; var_acima: number | null; var_conferencias: number | null; var_sem_preco: number | null
}
type Oportunidade = {
  insumo_id: string; insumo: string; dimensao: Dimensao; data_ultima: string; fornecedor_ultimo: string | null; custo_ultimo: number
  fornecedor_melhor: string | null; data_melhor: string; custo_melhor: number; economia_pct: number; conferir_unidade: boolean
}

const SEMANAS = 12
const ALTA_CRITICA = 10 // % no mês
const QUEDA_RELEVANTE = -5 // % no mês
// variação mensal fora desta faixa costuma ser embalagem/unidade diferente entre notas: "conferir unidade"
const SUSPEITA_ALTA = 100
const SUSPEITA_QUEDA = -40
const suspeita = (pct: number | null | undefined) => pct != null && (Number(pct) > SUSPEITA_ALTA || Number(pct) < SUSPEITA_QUEDA)

// Central de inteligência de custos da casa. Todos os números vêm do banco (painel_cmv_casa, cmv_da_casa,
// conferencias_da_casa, alertas, indicadores_insumos, serie_mercado_casa e oportunidades_economia);
// a tela só compara, ordena e desenha.
export default async function Inicio() {
  const s = await exigirCustos()
  const supabase = await createClient()
  const [painel, casa, abertas, alertas, indicadores, usados, serie, oport, variacoes, niveisR] = await Promise.all([
    supabase.rpc("painel_cmv_casa", { p_estab: s.casa.id }),
    supabase.rpc("cmv_da_casa", { p_estab: s.casa.id }),
    supabase.rpc("conferencias_da_casa", { p_estab: s.casa.id, p_abertas: true, p_limite: 200 }),
    alertasDaCasa(s.casa.id),
    indicadoresDaCasa(s.casa.id),
    insumosEmFichas(s.casa.id),
    // séries e oportunidades (0024): sem a migração, a tela segue sem os mini gráficos
    supabase.rpc("serie_mercado_casa", { p_estab: s.casa.id, p_semanas: SEMANAS, p_itens: 10 }),
    supabase.rpc("oportunidades_economia", { p_estab: s.casa.id }),
    variacoesDasReceitas(s.casa.id, "final"),
    // níveis de alerta das fichas do cardápio (0026): acumulado de 30 dias, drinks e pratos mais sensíveis
    supabase.rpc("alertas_fichas_niveis", { p_estab: s.casa.id, p_dias: 30 }),
  ])

  // insumos usados em fichas/preparos aprovados que ainda não têm preço nesta casa
  const semPreco = indicadores ? [...usados].filter((id) => (indicadores.get(id)?.status_ultima ?? "sem_preco") === "sem_preco").length : null
  const linhas = (painel.data ?? []) as LinhaCmv[]
  const media = ((casa.data ?? []) as { cmv_medio_simples_pct: number | null }[])[0]?.cmv_medio_simples_pct ?? null
  const meta = Number(linhas[0]?.meta_pct ?? 30)
  const acima = linhas.filter((l) => l.situacao === "acima_da_meta").sort((a, b) => Number(b.cmv_atual_pct) - Number(a.cmv_atual_pct))
  const semCusto = linhas.filter((l) => l.situacao === "sem_custo").length
  const conferencias = abertas.error ? null : ((abertas.data ?? []) as Conferencia[])
  const fichasAlta = alertas.fichas.filter((f) => f.tipo === "final")
  const niveis = niveisR.error ? null : ((niveisR.data ?? []) as AlertaNivel[])
  const nivelDa = new Map((niveis ?? []).map((n) => [n.receita_id, n.nivel]))
  const qtdNivel = (n: number) => (niveis ?? []).filter((x) => x.nivel === n).length
  // fichas do cardápio com maior oscilação de custo (para cima ou para baixo) nos últimos dias
  const noCardapio = new Map(linhas.map((l) => [l.receita_id, l]))
  const limiteData = new Date(Date.parse(hojeSP()) - DIAS_ALERTA * 86400000).toISOString().slice(0, 10)
  const afetadas = [...variacoes.values()]
    .filter((v) => noCardapio.has(v.receita_id) && v.variacao_pct != null && v.sinal !== "neutro" && (v.data_referencia ?? "") >= limiteData)
    .sort((a, b) => Math.abs(Number(b.variacao_pct)) - Math.abs(Number(a.variacao_pct)))
    .slice(0, 6)
  const historicos = new Map(await Promise.all(afetadas.map(async (v) => [v.receita_id, await historicoCusto(v.receita_id, s.casa.id)] as const)))

  // séries semanais (hoje = último ponto)
  const pontos = serie.error ? [] : ((serie.data ?? []) as Ponto[])
  const semanas = pontos.filter((p) => p.tipo === "casa")
  const hoje = semanas.at(-1)
  const doItem = new Map<string, Ponto[]>()
  for (const p of pontos) if (p.tipo === "item" && p.item_id) doItem.set(p.item_id, [...(doItem.get(p.item_id) ?? []), p])
  const col = <K extends keyof Ponto>(k: K) => semanas.map((p) => p[k] as number | null)

  // insumos que mais subiram / caíram no mês (média ponderada do mês × mês anterior)
  const ind = indicadores ? [...indicadores.values()].filter((i) => i.variacao_mensal_pct != null && usados.has(i.insumo_id)) : []
  const confiaveisPrimeiro = (a: { variacao_mensal_pct: number | null }, b: { variacao_mensal_pct: number | null }) =>
    Number(suspeita(a.variacao_mensal_pct)) - Number(suspeita(b.variacao_mensal_pct))
  const subiramTodos = ind.filter((i) => i.status_mensal === "subiu").sort((a, b) => Number(b.variacao_mensal_pct) - Number(a.variacao_mensal_pct))
  const cairamTodos = ind.filter((i) => i.status_mensal === "caiu").sort((a, b) => Number(a.variacao_mensal_pct) - Number(b.variacao_mensal_pct))
  const subiram = [...subiramTodos].sort(confiaveisPrimeiro).slice(0, 6)
  const cairam = [...cairamTodos].sort(confiaveisPrimeiro).slice(0, 6)
  const criticas = subiramTodos.filter((i) => Number(i.variacao_mensal_pct) >= ALTA_CRITICA && !suspeita(i.variacao_mensal_pct)).length
  const relevantes = cairamTodos.filter((i) => Number(i.variacao_mensal_pct) <= QUEDA_RELEVANTE && !suspeita(i.variacao_mensal_pct)).length
  const oportunidades = oport.error ? null : ((oport.data ?? []) as Oportunidade[]).filter((o) => usados.has(o.insumo_id))
  const economias = (oportunidades ?? []).filter((o) => !o.conferir_unidade)
  const conferirUnidade = (oportunidades ?? []).filter((o) => o.conferir_unidade)

  // nomes e médias mensais (6 meses) dos insumos exibidos
  const ids = [...subiram, ...cairam].map((i) => i.insumo_id)
  const meses = ultimosInicios(6)
  const [{ data: nomes }, { data: mensais }] = ids.length
    ? await Promise.all([
        supabase.from("insumos").select("id, nome, dimensao").in("id", ids),
        supabase.from("indicadores_mensais_insumo").select("insumo_id, mes, custo_medio")
          .eq("estabelecimento_id", s.casa.id).in("insumo_id", ids).gte("mes", meses[0]),
      ])
    : [{ data: [] }, { data: [] }]
  const insumo = new Map(((nomes ?? []) as { id: string; nome: string; dimensao: Dimensao }[]).map((n) => [n.id, n]))
  const mediaMes = new Map(((mensais ?? []) as { insumo_id: string; mes: string; custo_medio: number }[]).map((m) => [`${m.insumo_id}:${m.mes.slice(0, 10)}`, m.custo_medio]))
  const serieInsumo = (id: string) => meses.map((m) => mediaMes.get(`${id}:${m}`) ?? null)

  const ticker: ItemTicker[] = [
    { rotulo: "CMV médio", valor: percentual(media), delta: delta(hoje?.var_cmv_pp, " p.p."), tom: tomDe(hoje?.var_cmv_pp), href: "/cmv" },
    { rotulo: "Acima da meta", valor: String(acima.length), delta: delta(hoje?.var_acima), tom: tomDe(hoje?.var_acima), href: "/cmv?situacao=acima_da_meta" },
    ...(niveis ? [{ rotulo: "Fichas críticas", valor: String(qtdNivel(3)), tom: (qtdNivel(3) ? "alta" : "neutro") as Tom, href: "/alertas?nivel=3#niveis" }] : []),
    { rotulo: "Compras p/ conferir", valor: conferencias ? String(conferencias.length) : "—", delta: delta(hoje?.var_conferencias), tom: tomDe(hoje?.var_conferencias), href: "/pendencias" },
    { rotulo: `Ingredientes em alta forte (≥ ${ALTA_CRITICA}% no mês)`, valor: String(criticas), tom: criticas ? "alta" : "neutro", href: "/insumos?variacao=subiu&ordem=alta" },
    { rotulo: `Em queda forte (≥ ${-QUEDA_RELEVANTE}% no mês)`, valor: String(relevantes), tom: relevantes ? "queda" : "neutro", href: "/insumos?variacao=caiu&ordem=queda" },
    { rotulo: "Oportunidades de economia", valor: oportunidades ? String(economias.length) : "—", tom: economias.length ? "queda" : "neutro", href: "#oportunidades" },
    ...subiram.filter((i) => !suspeita(i.variacao_mensal_pct)).slice(0, 4).map((i): ItemTicker => ({ rotulo: insumo.get(i.insumo_id)?.nome ?? "—", valor: "", delta: `▲ ${pctPreciso(i.variacao_mensal_pct!)}`, tom: "alta", href: `/insumos/${i.insumo_id}` })),
    ...cairam.filter((i) => !suspeita(i.variacao_mensal_pct)).slice(0, 4).map((i): ItemTicker => ({ rotulo: insumo.get(i.insumo_id)?.nome ?? "—", valor: "", delta: `▼ ${pctPreciso(i.variacao_mensal_pct!)}`, tom: "queda", href: `/insumos/${i.insumo_id}` })),
  ]

  return (
    <div className="-mx-3 -my-4 min-h-[calc(100dvh-3.5rem)] bg-area px-3 py-4 sm:-mx-6 sm:px-6 print:m-0 print:bg-transparent">
    <div className="mx-auto grid max-w-[1600px] gap-5 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Início</h1>
          <p className="text-sm text-muted-foreground">Inteligência de custos · {s.casa.nome}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Atualizado {dataHora(new Date().toISOString())}{hoje ? ` · tendências: últimas ${SEMANAS} semanas` : ""}
        </p>
      </div>

      {/* Market overview */}
      <section aria-label="Resumo" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card href="/cmv" icone={PieChart} titulo="CMV médio do cardápio" valor={percentual(media)}
          risco={media == null ? "neutro" : media > meta ? "alta" : "queda"}
          detalhe={`meta da casa ${percentual(meta)}`} delta={delta(hoje?.var_cmv_pp, " p.p.")} tom={tomDe(hoje?.var_cmv_pp)}
          serie={col("cmv_medio")} ajuda="Média simples do CMV dos itens ativos do cardápio com preço e custo. Verde quando está dentro da meta da casa. Comparação: 4 semanas atrás." />
        <Card href="/cmv?situacao=acima_da_meta" icone={AlertTriangle} titulo="Itens acima da meta" valor={String(acima.length)}
          risco={acima.length ? "alta" : "queda"}
          detalhe={semCusto ? `${semCusto} ${semCusto === 1 ? "item" : "itens"} sem custo` : `de ${linhas.length} no cardápio`}
          delta={delta(hoje?.var_acima)} tom={tomDe(hoje?.var_acima)} serie={col("itens_acima")}
          ajuda="Itens do cardápio com CMV acima da meta da casa. Comparação: 4 semanas atrás." />
        <Card href="/pendencias" icone={ShoppingCart} titulo="Compras para conferir" valor={conferencias ? String(conferencias.length) : "—"}
          risco={conferencias?.length ? "alta" : "neutro"} detalhe="alta acima do limite da casa"
          delta={delta(hoje?.var_conferencias)} tom={tomDe(hoje?.var_conferencias)} serie={col("conferencias_abertas")}
          ajuda="Compras com alta acima do limite da casa esperando conferência. Enquanto isso, o custo anterior continua valendo." />
        <Card href={niveis ? "/alertas#niveis" : `/alertas?dias=${DIAS_ALERTA}#fichas`} icone={BookOpen} titulo="Fichas em alerta"
          valor={String(niveis ? qtdNivel(3) + qtdNivel(2) : fichasAlta.length)}
          risco={(niveis ? qtdNivel(3) + qtdNivel(2) : fichasAlta.length) ? "alta" : "neutro"}
          detalhe={niveis ? `${qtdNivel(3)} ${qtdNivel(3) === 1 ? "crítica" : "críticas"} · ${qtdNivel(2)} em alerta · ${qtdNivel(1)} em atenção` : `mais de 10% em ${DIAS_ALERTA} dias`}
          delta={hoje?.var_pct != null ? `${delta(hoje.var_pct, "%")} custo das fichas` : undefined} tom={tomDe(hoje?.var_pct)}
          serie={col("indice_custo_fichas")}
          ajuda={niveis ? "Número: fichas do cardápio em alerta ou crítico (custo ou CMV de hoje comparado com 30 dias atrás). Drinks e pratos têm limites menores, ajustáveis em Dados da casa. Gráfico: custo médio das fichas do cardápio (índice 100 = 12 semanas atrás)."
            : `Número: fichas cujo custo subiu mais de 10% nos últimos ${DIAS_ALERTA} dias. Gráfico: custo médio das fichas do cardápio (índice 100 = 12 semanas atrás), com a receita atual.`} />
        {semPreco != null ? (
          <Card href="/insumos?variacao=sem_preco&uso=fichas" icone={PackageX} titulo="Insumos sem preço" valor={String(semPreco)}
            risco={semPreco ? "alta" : "queda"} detalhe="usados em fichas"
            delta={delta(hoje?.var_sem_preco)} tom={tomDe(hoje?.var_sem_preco)} serie={col("insumos_sem_preco")}
            ajuda="Insumos usados em fichas ou preparos aprovados que ainda não têm preço nesta casa. Sem preço, o custo da ficha fica incompleto." />
        ) : null}
      </section>

      <Ticker itens={ticker} />

      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        {/* A — produtos acima da meta */}
        <Quadro titulo="Produtos acima da meta de CMV" sub={`meta da casa ${percentual(meta)} · custo: variação em 4 semanas`}
          link={{ href: "/cmv?situacao=acima_da_meta", rotulo: "Painel de CMV" }} vazio={acima.length ? null : "Nenhum item acima da meta."}>
          <Tabela cab={["Produto", "Preço", "CMV", "Para a meta", "Custo 4 sem.", "Tendência CMV"]} ocultar={[3, 4]}>
            {acima.slice(0, 6).map((l) => {
              const sr = doItem.get(l.item_id) ?? []
              const ult = sr.at(-1)
              return (
                <tr key={l.item_id} className="hover:bg-muted/40">
                  <td className="max-w-0 px-3 py-2">
                    <Link href={`/fichas/${l.receita_id}/preco`} className="block truncate font-medium hover:underline">{l.produto}</Link>
                    <span className="block truncate text-[13px] text-muted-foreground">{l.cardapio}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{reais(l.preco_publicado)}</td>
                  <td className="px-3 py-2 text-right"><Pilula tom="alta">{percentual(l.cmv_atual_pct)}</Pilula></td>
                  <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{reais(l.preco_meta)}</td>
                  <td className="hidden px-3 py-2 text-right sm:table-cell"><Delta v={ult?.var_pct} sufixo="%" /></td>
                  <td className="w-24 px-3 py-2"><Sparkline valores={sr.map((p) => p.cmv_pct)} tom={tomDe(ult?.var_cmv_pp)} rotulo={`CMV de ${l.produto} nas últimas semanas`} /></td>
                </tr>
              )
            })}
          </Tabela>
        </Quadro>

        {/* B — fichas do cardápio mais afetadas pelas oscilações de preço de compra */}
        <Quadro titulo="Fichas mais afetadas pelas compras" sub={`maior variação de custo nos últimos ${DIAS_ALERTA} dias · última compra que mudou o custo`}
          link={{ href: `/alertas?dias=${DIAS_ALERTA}#fichas`, rotulo: "Ver alertas" }}
          vazio={afetadas.length ? null : `Nenhuma ficha do cardápio mudou de custo nos últimos ${DIAS_ALERTA} dias.`}>
          <Tabela cab={["Ficha", "Antes", "Agora", "Variação", "CMV", "Oscilação"]} ocultar={[1, 4]}>
            {afetadas.map((v) => {
              const h = historicos.get(v.receita_id) ?? []
              const l = noCardapio.get(v.receita_id)
              return (
                <tr key={v.receita_id} className="hover:bg-muted/40">
                  <td className="max-w-0 px-3 py-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Link href={`/fichas/${v.receita_id}`} className="truncate font-medium hover:underline">{v.nome}</Link>
                      {nivelDa.get(v.receita_id) ? <SeloNivel nivel={nivelDa.get(v.receita_id)!} /> : null}
                    </span>
                    <span className="block truncate text-[13px] text-muted-foreground" title={h.at(-1)?.insumos}>
                      {dataCurta(v.data_referencia)}{h.at(-1)?.insumos ? ` · ${h.at(-1)!.insumos}` : ""}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground sm:table-cell">{reais(v.custo_anterior)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{reais(v.custo_atual)}</td>
                  <td className="px-3 py-2 text-right"><Pilula tom={v.sinal === "vermelho" ? "alta" : v.sinal === "verde" ? "queda" : "neutro"}>
                    {v.sinal === "vermelho" ? "▲" : "▼"} {pctPreciso(v.variacao_pct!)}
                  </Pilula></td>
                  <td className="hidden px-3 py-2 text-right sm:table-cell">
                    {l?.cmv_atual_pct != null
                      ? <span className={cn("text-xs font-semibold tabular-nums", l.situacao === "acima_da_meta" ? "text-alta" : "text-queda")}>{percentual(l.cmv_atual_pct)}</span>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="w-24 px-3 py-2">
                    <Sparkline valores={h.slice(-10).map((p) => p.custo)} tom={v.sinal === "vermelho" ? "alta" : "queda"}
                      falta="1 alteração" rotulo={`Custo de ${v.nome} nas últimas alterações`} />
                  </td>
                </tr>
              )
            })}
          </Tabela>
        </Quadro>

        {/* C e D — maiores altas e quedas no mês */}
        {([["alta", subiram], ["queda", cairam]] as const).map(([tom, lista]) => (
          <Quadro key={tom} titulo={tom === "alta" ? "Maiores altas de insumos" : "Maiores quedas de insumos"}
            sub={`média ponderada do mês × mês anterior${tom === "queda" ? " · oportunidade de negociação" : ""}`}
            link={{ href: tom === "alta" ? "/insumos?variacao=subiu&ordem=alta" : "/insumos?variacao=caiu&ordem=queda", rotulo: "Ver insumos" }}
            vazio={lista.length ? null : `Nenhuma ${tom === "alta" ? "alta" : "queda"} no mês (média do mês contra o mês anterior).`}>
            <Tabela cab={["Insumo", "Mês anterior", "Mês atual", "Mensal", "Últ. compra", "6 meses"]} ocultar={[1, 4]}>
              {lista.map((i) => {
                const n = insumo.get(i.insumo_id)
                return (
                  <tr key={i.insumo_id} className="hover:bg-muted/40">
                    <td className="max-w-0 px-3 py-2">
                      <Link href={`/insumos/${i.insumo_id}`} className="block truncate font-medium hover:underline">{n?.nome ?? "—"}</Link>
                      <span className="block truncate text-[13px] text-muted-foreground">{i.compras_mes} {i.compras_mes === 1 ? "compra" : "compras"} em {nomeMes(i.mes)}</span>
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground sm:table-cell">{n ? custoPorUnidade(i.media_mes_anterior, n.dimensao) : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{n ? custoPorUnidade(i.media_mes, n.dimensao) : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {suspeita(i.variacao_mensal_pct)
                        ? <Pilula tom="neutro" titulo={`Variação de ${pctPreciso(i.variacao_mensal_pct!)}: confira se as notas usam a mesma embalagem ou unidade`}>conferir unidade</Pilula>
                        : <SeloIndicador status={i.status_mensal} pct={i.variacao_mensal_pct} />}
                    </td>
                    <td className="hidden px-3 py-2 text-right sm:table-cell" title="Última compra × compra anterior (compras consecutivas)">
                      <SeloIndicador status={i.status_ultima} pct={i.variacao_ultima_pct} />
                    </td>
                    <td className="w-24 px-3 py-2"><Sparkline valores={serieInsumo(i.insumo_id)} tom={suspeita(i.variacao_mensal_pct) ? "neutro" : tom} minimo={3}
                      falta={`só ${serieInsumo(i.insumo_id).filter((v) => v != null).length} meses`} rotulo={`Média mensal de ${n?.nome ?? "insumo"} nos últimos 6 meses`} /></td>
                  </tr>
                )
              })}
            </Tabela>
          </Quadro>
        ))}
      </div>

      {/* oportunidades de economia */}
      {oportunidades ? (
        <section id="oportunidades" className="scroll-mt-20">
          <Quadro titulo="Oportunidades de economia" sub="última compra × menor preço pago a outro fornecedor nos últimos 90 dias"
            link={{ href: "/insumos", rotulo: "Ver insumos" }} vazio={oportunidades.length ? null : "Nenhum insumo comprado acima do menor preço recente de outro fornecedor."}>
            <Tabela cab={["Insumo", "Última compra", "Menor preço (90 dias)", "Diferença"]} ocultar={[]}>
              {[...economias.slice(0, 8), ...conferirUnidade.slice(0, 4)].map((o) => (
                <tr key={o.insumo_id} className={cn("hover:bg-muted/40", o.conferir_unidade && "text-muted-foreground")}>
                  <td className="max-w-0 px-3 py-2">
                    <Link href={`/insumos/${o.insumo_id}`} className="block truncate font-medium hover:underline">{o.insumo}</Link>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="block whitespace-nowrap tabular-nums">{custoPorUnidade(o.custo_ultimo, o.dimensao)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{o.fornecedor_ultimo ?? "—"} · {dataCurta(o.data_ultima)}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="block whitespace-nowrap tabular-nums">{custoPorUnidade(o.custo_melhor, o.dimensao)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{o.fornecedor_melhor ?? "—"} · {dataCurta(o.data_melhor)}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {o.conferir_unidade
                      ? <Pilula tom="neutro" titulo="Diferença acima de 50%: confira se as notas usam a mesma embalagem ou unidade">conferir unidade</Pilula>
                      : <Pilula tom="queda">▼ {pctPreciso(o.economia_pct, false)}</Pilula>}
                  </td>
                </tr>
              ))}
            </Tabela>
          </Quadro>
        </section>
      ) : null}
    </div>
    </div>
  )
}

// "+0,5 p.p." / "−2" / "= estável" — diferença já calculada pelo banco
function delta(v: number | null | undefined, sufixo = ""): string | undefined {
  if (v == null) return undefined
  const n = Number(v)
  if (n === 0) return "= estável"
  const txt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Math.abs(n))
  return `${n > 0 ? "▲ +" : "▼ −"}${txt}${sufixo}`
}

// primeiros dias dos últimos n meses (calendário de São Paulo), do mais antigo para o atual
function ultimosInicios(n: number): string[] {
  const [a, m] = hojeSP().split("-").map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (n - 1 - i), 1))
    return d.toISOString().slice(0, 10)
  })
}

const TEXTO_TOM: Record<Tom, string> = { alta: "text-alta", queda: "text-queda", neutro: "text-neutro" }
const FUNDO_TOM: Record<Tom, string> = { alta: "bg-alta-fundo text-alta", queda: "bg-queda-fundo text-queda", neutro: "bg-neutro-fundo text-neutro" }

function Card({ href, icone: Icone, titulo, valor, detalhe, delta: d, tom, serie, risco, ajuda }: {
  href: string; icone: LucideIcon; titulo: string; valor: string; detalhe: string; delta?: string; tom: Tom
  serie: (number | null)[]; risco: Tom; ajuda: string
}) {
  return (
    <Link href={href} className="surgir group relative grid min-w-0 content-between gap-2 overflow-hidden rounded-xl border bg-card px-4 py-3 shadow-sm transition-shadow hover:shadow-md">
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", risco === "alta" ? "bg-alta" : risco === "queda" ? "bg-queda" : "bg-neutro/40")} />
      <span className="sr-only">{risco === "alta" ? "Atenção" : risco === "queda" ? "Favorável" : "Neutro"}</span>
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground/75">
          <Icone className="size-4" aria-hidden /> {titulo}
        </span>
        <span className="relative">
          <Info className="size-3.5 text-muted-foreground/70" aria-label={ajuda} />
          <span role="tooltip" className="pointer-events-none absolute right-0 top-5 z-20 hidden w-60 rounded-lg bg-painel p-2.5 text-xs font-normal leading-snug text-white shadow-lg group-hover:block group-focus-visible:block">
            {ajuda}
          </span>
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums tracking-tight">{valor}</span>
        {d ? <span className={cn("text-xs font-semibold tabular-nums", TEXTO_TOM[tom])} title="comparado com 4 semanas atrás">{d}</span> : null}
      </div>
      <Sparkline valores={serie} tom={tom} rotulo={`${titulo}: evolução semanal`} />
      <span className="text-[13px] text-foreground/65">{detalhe}</span>
    </Link>
  )
}

type ItemTicker = { rotulo: string; valor: string; delta?: string; tom: Tom; href: string }

// Faixa estilo bolsa: estática (rola com o dedo/mouse), não anima sozinha
function Ticker({ itens }: { itens: ItemTicker[] }) {
  const cor: Record<Tom, string> = { alta: "text-painel-alta", queda: "text-painel-queda", neutro: "text-white/60" }
  return (
    <nav aria-label="Indicadores do mercado" className="surgir relative overflow-hidden rounded-xl bg-painel text-white shadow-sm">
      <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max min-w-full divide-x divide-white/10 pr-10">
        {itens.map((t, i) => (
          <li key={i}>
            <Link href={t.href} className="flex min-h-12 items-center gap-2 whitespace-nowrap px-4 py-2 text-sm hover:bg-white/5">
              <span className="text-white/70">{t.rotulo}</span>
              {t.valor ? <b className="tabular-nums">{t.valor}</b> : null}
              {t.delta ? <span className={cn("text-xs font-semibold tabular-nums", cor[t.tom])}>{t.delta}</span>
                : t.tom !== "neutro" ? <span aria-hidden className={cn("text-xs", cor[t.tom])}>●</span> : null}
            </Link>
          </li>
        ))}
      </ul>
      </div>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-painel to-transparent" />
    </nav>
  )
}

function Quadro({ titulo, sub, link, vazio, children }: {
  titulo: string; sub: string; link: { href: string; rotulo: string }; vazio: string | null; children: React.ReactNode
}) {
  return (
    <section className="surgir grid min-w-0 content-start overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-2 border-b px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{titulo}</h2>
          <p className="truncate text-[13px] text-muted-foreground">{sub}</p>
        </div>
        <Link href={link.href} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md border bg-background px-2.5 text-xs font-medium hover:bg-muted">
          {link.rotulo} <span aria-hidden>→</span>
        </Link>
      </div>
      {vazio ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">{vazio}</p> : children}
    </section>
  )
}

// Tabela densa; "ocultar": índices das colunas que somem no celular
function Tabela({ cab, ocultar, children }: { cab: string[]; ocultar: number[]; children: React.ReactNode }) {
  return (
    <table className="w-full table-fixed text-sm">
      <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
        <tr>
          {cab.map((c, i) => (
            <th key={c} className={cn("px-3 py-1.5 font-medium", i === 0 ? "w-[38%] text-left" : "text-right", ocultar.includes(i) && "hidden sm:table-cell")}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y">{children}</tbody>
    </table>
  )
}

function Pilula({ tom, titulo, children }: { tom: Tom; titulo?: string; children: React.ReactNode }) {
  return <span title={titulo} className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", FUNDO_TOM[tom])}>{children}</span>
}

function Delta({ v, sufixo = "" }: { v: number | null | undefined; sufixo?: string }) {
  const d = delta(v, sufixo)
  return d ? <span className={cn("whitespace-nowrap text-xs font-semibold tabular-nums", TEXTO_TOM[tomDe(v)])}>{d}</span> : <span className="text-xs text-muted-foreground">—</span>
}

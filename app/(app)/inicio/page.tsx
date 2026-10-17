import type { Metadata } from "next"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { alertasDaCasa, DIAS_ALERTA, indicadoresDaCasa } from "@/lib/dados"
import { custoPorUnidade, dataCurta, percentual, reais, type Dimensao } from "@/lib/formato"
import { CORES_STATUS } from "@/components/status-preco"
import { SeloIndicador, pctPreciso } from "@/components/indicador-preco"
import type { LinhaCmv } from "@/components/painel-cmv"
import type { Conferencia } from "@/components/conferencias"
import { cn } from "@/lib/utils"
import { insumosEmFichas } from "../insumos/dados"

export const metadata: Metadata = { title: "Início" }

// Resumo da casa: o que pede atenção hoje. Só exibe o que o banco calculou (painel_cmv_casa, cmv_da_casa,
// conferencias_da_casa, alertas_fichas e indicadores_insumos).
export default async function Inicio() {
  const s = await exigirCustos()
  const supabase = await createClient()
  const [painel, casa, abertas, alertas, indicadores, usados] = await Promise.all([
    supabase.rpc("painel_cmv_casa", { p_estab: s.casa.id }),
    supabase.rpc("cmv_da_casa", { p_estab: s.casa.id }),
    supabase.rpc("conferencias_da_casa", { p_estab: s.casa.id, p_abertas: true, p_limite: 200 }),
    alertasDaCasa(s.casa.id),
    indicadoresDaCasa(s.casa.id),
    insumosEmFichas(),
  ])
  // insumos usados em fichas/preparos aprovados que ainda não têm preço nesta casa
  const semPreco = indicadores ? [...usados].filter((id) => (indicadores.get(id)?.status_ultima ?? "sem_preco") === "sem_preco").length : null
  const linhas = (painel.data ?? []) as LinhaCmv[]
  const media = ((casa.data ?? []) as { cmv_medio_simples_pct: number | null }[])[0]?.cmv_medio_simples_pct ?? null
  const meta = Number(linhas[0]?.meta_pct ?? 30)
  const acima = linhas.filter((l) => l.situacao === "acima_da_meta")
    .sort((a, b) => Number(b.cmv_atual_pct) - Number(a.cmv_atual_pct))
  const semCusto = linhas.filter((l) => l.situacao === "sem_custo").length
  const conferencias = abertas.error ? null : ((abertas.data ?? []) as Conferencia[])
  const fichasAlta = alertas.fichas.filter((f) => f.tipo === "final")

  // insumos que mais subiram / caíram no mês (média do mês × mês anterior)
  const ind = indicadores ? [...indicadores.values()].filter((i) => i.variacao_mensal_pct != null) : []
  const subiram = ind.filter((i) => i.status_mensal === "subiu").sort((a, b) => Number(b.variacao_mensal_pct) - Number(a.variacao_mensal_pct)).slice(0, 6)
  const cairam = ind.filter((i) => i.status_mensal === "caiu").sort((a, b) => Number(a.variacao_mensal_pct) - Number(b.variacao_mensal_pct)).slice(0, 6)
  const ids = [...subiram, ...cairam].map((i) => i.insumo_id)
  const { data: nomes } = ids.length
    ? await supabase.from("insumos").select("id, nome, dimensao").in("id", ids)
    : { data: [] as { id: string; nome: string; dimensao: Dimensao }[] }
  const insumo = new Map((nomes ?? []).map((n) => [n.id as string, n as { id: string; nome: string; dimensao: Dimensao }]))

  const vermelho = CORES_STATUS.subiu.texto
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-xl font-semibold">Início</h1>
      </div>

      <section aria-label="Resumo" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Indicador href="/cmv" valor={percentual(media)} destaque={media != null && media > meta}
          rotulo="CMV médio do cardápio" detalhe={`meta da casa ${percentual(meta)}`} />
        <Indicador href="/cmv?situacao=acima_da_meta" valor={String(acima.length)} destaque={acima.length > 0}
          rotulo={acima.length === 1 ? "item acima da meta" : "itens acima da meta"}
          detalhe={semCusto ? `${semCusto} ${semCusto === 1 ? "item" : "itens"} sem custo` : `de ${linhas.length} no cardápio`} />
        <Indicador href="/pendencias" valor={conferencias ? String(conferencias.length) : "—"} destaque={!!conferencias?.length}
          rotulo={conferencias?.length === 1 ? "compra para conferir" : "compras para conferir"} detalhe="alta acima do limite da casa" />
        <Indicador href={`/alertas?dias=${DIAS_ALERTA}#fichas`} valor={String(fichasAlta.length)} destaque={fichasAlta.length > 0}
          rotulo={fichasAlta.length === 1 ? "ficha subiu de custo" : "fichas subiram de custo"} detalhe={`mais de 10% em ${DIAS_ALERTA} dias · revisar altas`} />
        {semPreco != null ? (
          <Indicador href="/insumos?variacao=sem_preco&uso=fichas" valor={String(semPreco)} destaque={semPreco > 0}
            rotulo={semPreco === 1 ? "insumo sem preço" : "insumos sem preço"} detalhe="usados em fichas · completar preços" />
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Quadro titulo="Itens mais acima da meta" link={{ href: "/cmv?situacao=acima_da_meta", rotulo: "Ver no Painel de CMV" }}
          vazio={acima.length ? null : "Nenhum item acima da meta."}>
          {acima.slice(0, 6).map((l) => (
            <Linha key={l.item_id} href={`/fichas/${l.receita_id}/preco`} titulo={l.produto}
              detalhe={`preço ${reais(l.preco_publicado)} · para a meta ${reais(l.preco_meta)}`}>
              <span className="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums" style={{ color: CORES_STATUS.subiu.texto, backgroundColor: CORES_STATUS.subiu.fundo }}>
                CMV {percentual(l.cmv_atual_pct)}
              </span>
            </Linha>
          ))}
        </Quadro>

        <Quadro titulo="Compras esperando conferência" link={{ href: "/pendencias", rotulo: "Conferir em Compras" }}
          vazio={conferencias == null ? "Conferência de compras indisponível." : conferencias.length ? null : "Nenhuma compra esperando conferência."}>
          {(conferencias ?? []).slice(0, 6).map((c) => (
            <Linha key={c.id} href="/pendencias" titulo={c.insumo}
              detalhe={`${dataCurta(c.data_compra)}${c.fornecedor ? ` · ${c.fornecedor}` : ""} · ${custoPorUnidade(c.custo_referencia, c.dimensao)} → ${custoPorUnidade(c.custo_novo, c.dimensao)}`}>
              <b className="text-sm tabular-nums" style={{ color: vermelho }}>▲ {pctPreciso(c.variacao_pct)}</b>
            </Linha>
          ))}
        </Quadro>

        <Quadro titulo="Insumos que mais subiram no mês" link={{ href: "/insumos?variacao=subiu&ordem=alta", rotulo: "Ver insumos" }}
          vazio={subiram.length ? null : "Nenhuma alta no mês (média do mês contra o mês anterior)."}>
          {subiram.map((i) => {
            const n = insumo.get(i.insumo_id)
            return (
              <Linha key={i.insumo_id} href={`/insumos/${i.insumo_id}`} titulo={n?.nome ?? "—"}
                detalhe={n ? `média ${custoPorUnidade(i.media_mes, n.dimensao)} · antes ${custoPorUnidade(i.media_mes_anterior, n.dimensao)}` : ""}>
                <SeloIndicador status="subiu" pct={i.variacao_mensal_pct} />
              </Linha>
            )
          })}
        </Quadro>

        <Quadro titulo="Insumos que mais caíram no mês" link={{ href: "/insumos?variacao=caiu&ordem=queda", rotulo: "Ver insumos" }}
          vazio={cairam.length ? null : "Nenhuma queda no mês (média do mês contra o mês anterior)."}>
          {cairam.map((i) => {
            const n = insumo.get(i.insumo_id)
            return (
              <Linha key={i.insumo_id} href={`/insumos/${i.insumo_id}`} titulo={n?.nome ?? "—"}
                detalhe={n ? `média ${custoPorUnidade(i.media_mes, n.dimensao)} · antes ${custoPorUnidade(i.media_mes_anterior, n.dimensao)}` : ""}>
                <SeloIndicador status="caiu" pct={i.variacao_mensal_pct} />
              </Linha>
            )
          })}
        </Quadro>
      </div>
    </div>
  )
}

function Indicador({ href, valor, rotulo, detalhe, destaque }: { href: string; valor: string; rotulo: string; detalhe: string; destaque: boolean }) {
  return (
    <Link href={href} className="grid gap-0.5 rounded-xl border px-4 py-3 hover:bg-muted/50">
      <span className={cn("text-2xl font-semibold tabular-nums", destaque && "text-[#EC001C]")}>{valor}</span>
      <span className="text-sm">{rotulo}</span>
      <span className="text-xs text-muted-foreground">{detalhe}</span>
    </Link>
  )
}

function Quadro({ titulo, link, vazio, children }: {
  titulo: string; link: { href: string; rotulo: string }; vazio: string | null; children: React.ReactNode
}) {
  return (
    <section className="grid content-start rounded-xl border">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <Link href={link.href} className="text-xs text-muted-foreground underline hover:text-foreground">{link.rotulo}</Link>
      </div>
      {vazio ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">{vazio}</p> : <ul className="divide-y">{children}</ul>}
    </section>
  )
}

function Linha({ href, titulo, detalhe, children }: { href: string; titulo: string; detalhe: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-muted/50">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{titulo}</span>
          <span className="block truncate text-xs text-muted-foreground">{detalhe}</span>
        </span>
        <span className="shrink-0">{children}</span>
      </Link>
    </li>
  )
}

import { custoPorUnidade, dataCurta, nomeMes, type Dimensao } from "@/lib/formato"
import type { IndicadorInsumo } from "@/lib/dados"
import { CORES_STATUS } from "@/components/status-preco"
import { SeloIndicador, pctPreciso, type StatusIndicador } from "@/components/indicador-preco"

// Detalhe do insumo: indicadores A, B e C e o histórico mensal (valores de indicadores_insumos e
// historico_mensal_insumo; aqui só se exibe)
export type LinhaMensal = {
  mes: string; mes_encerrado: boolean; compras: number; quantidade_base: number; custo_medio: number
  menor_custo: number; maior_custo: number; volatilidade_pct: number | null; fornecedores: number
  variacao_mensal_pct: number | null; status_mensal: "subiu" | "caiu" | "estavel" | "sem_base"
}

const mesCurto = (iso: string) => {
  const n = nomeMes(iso)
  return `${n.slice(0, 3)}/${n.slice(-2)}`
}
const mesAnterior = (iso: string) => {
  const [a, m] = iso.split("-").map(Number)
  const t = a * 12 + (m - 1) - 1
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`
}

export function IndicadoresInsumo({ ind, historico, dim }: { ind: IndicadorInsumo | undefined; historico: LinhaMensal[]; dim: Dimensao }) {
  const valor = (v: number | null | undefined) => (v == null ? "—" : custoPorUnidade(v, dim))
  const doMes = ind ? historico.find((h) => h.mes === ind.mes) : undefined
  const mes = ind?.mes ?? ""
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Bloco titulo="Variação da última compra">
          <SeloIndicador status={ind?.status_ultima ?? "sem_preco"} pct={ind?.variacao_ultima_pct} />
          <p className="text-xs text-muted-foreground">
            {ind?.ultimo_preco != null
              ? <>Última {valor(ind.ultimo_preco)} em {dataCurta(ind.data_ultima_compra)}{ind.preco_anterior != null ? <> · anterior {valor(ind.preco_anterior)}</> : " · só uma compra validada"}</>
              : ind?.custo_oficial != null ? "Só preço de referência (sem compra validada)" : "Nenhuma compra validada nesta casa"}
          </p>
        </Bloco>
        <Bloco titulo={`Tendência de ${nomeMes(mes)}${ind && !ind.mes_encerrado ? " (mês em andamento)" : ""}`}>
          <SeloIndicador status={ind?.status_mensal ?? "sem_base"} pct={ind?.variacao_mensal_pct} />
          <p className="text-xs text-muted-foreground">
            {ind?.media_mes != null ? <>Média {valor(ind.media_mes)} em {ind.compras_mes} {ind.compras_mes === 1 ? "compra" : "compras"}</> : `Sem compras em ${nomeMes(mes)}`}
            {" · "}
            {ind?.media_mes_anterior != null ? <>{nomeMes(mesAnterior(mes))}: {valor(ind.media_mes_anterior)}</> : `sem compras em ${nomeMes(mesAnterior(mes))}`}
          </p>
        </Bloco>
        <Bloco titulo={`Volatilidade em ${nomeMes(mes)}`}>
          <SeloIndicador status={ind?.status_volatilidade === "ok" ? "estavel" : "indisponivel"} pct={ind?.volatilidade_pct} tipo="volatilidade" />
          <p className="text-xs text-muted-foreground">
            {doMes && doMes.compras >= 2 ? <>Menor {valor(doMes.menor_custo)} · maior {valor(doMes.maior_custo)} · {doMes.fornecedores} {doMes.fornecedores === 1 ? "fornecedor" : "fornecedores"}</>
              : "Precisa de pelo menos 2 compras no mês"}
          </p>
        </Bloco>
      </div>

      {historico.length >= 2 ? <GraficoMensal linhas={historico} dim={dim} /> : null}

      {historico.length ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5">Mês</th>
                <th className="px-3 py-1.5 text-right">Compras</th>
                <th className="px-3 py-1.5 text-right">Preço médio</th>
                <th className="px-3 py-1.5 text-right">Menor</th>
                <th className="px-3 py-1.5 text-right">Maior</th>
                <th className="px-3 py-1.5 text-right">Volatilidade</th>
                <th className="px-3 py-1.5 text-right">Fornecedores</th>
                <th className="px-3 py-1.5 text-right">Tendência</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...historico].reverse().map((h) => (
                <tr key={h.mes}>
                  <td className="whitespace-nowrap px-3 py-1.5">{nomeMes(h.mes)}{h.mes_encerrado ? "" : <span className="text-xs text-muted-foreground"> · em andamento</span>}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{h.compras}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums">{valor(h.custo_medio)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">{valor(h.menor_custo)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">{valor(h.maior_custo)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{h.volatilidade_pct != null ? pctPreciso(h.volatilidade_pct, false) : <span className="text-xs text-muted-foreground">indisponível</span>}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{h.fornecedores}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right"><SeloIndicador status={h.status_mensal} pct={h.variacao_mensal_pct} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Ainda não há compras validadas deste insumo nesta casa para o histórico mensal.</p>
      )}
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start justify-items-start gap-1.5 rounded-lg border px-3 py-2.5">
      <span className="text-xs font-medium text-muted-foreground">{titulo}</span>
      {children}
    </div>
  )
}

// Preço médio por mês (linha) com a faixa do menor ao maior preço (barra vertical)
const W = 640, H = 200, E = 72, D = 16, T = 18, B = 30

function GraficoMensal({ linhas, dim }: { linhas: LinhaMensal[]; dim: Dimensao }) {
  const valor = (v: number) => custoPorUnidade(v, dim)
  const todos = linhas.flatMap((l) => [Number(l.menor_custo), Number(l.maior_custo)])
  let min = Math.min(...todos), max = Math.max(...todos)
  const folga = (max - min) * 0.12 || max * 0.05 || 1
  min = Math.max(0, min - folga); max += folga
  const passoX = (W - E - D) / Math.max(linhas.length - 1, 1)
  const x = (i: number) => E + i * passoX
  const y = (v: number) => T + ((max - v) * (H - T - B)) / (max - min)
  const grade = [0, 1, 2].map((k) => min + ((max - min) * (k + 0.5)) / 3)
  const caminho = linhas.map((l, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(Number(l.custo_medio)).toFixed(1)}`).join(" ")
  const cor = (s: StatusIndicador) => (s === "subiu" ? CORES_STATUS.subiu.texto : s === "caiu" ? CORES_STATUS.caiu.texto : s === "estavel" ? CORES_STATUS.estavel.texto : CORES_STATUS.sem_comparacao.texto)
  return (
    <figure className="grid gap-1">
      <figcaption className="text-xs text-muted-foreground">Preço médio por mês (linha) e faixa do menor ao maior preço pago (barra)</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-3xl text-foreground" role="img"
        aria-label={`Preço médio de ${valor(Number(linhas[0].custo_medio))} em ${nomeMes(linhas[0].mes)} a ${valor(Number(linhas[linhas.length - 1].custo_medio))} em ${nomeMes(linhas[linhas.length - 1].mes)}`}>
        {grade.map((g) => (
          <g key={g}>
            <line x1={E} x2={W - D} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity={0.08} />
            <text x={E - 8} y={y(g) + 3} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.55}>{valor(g)}</text>
          </g>
        ))}
        {linhas.map((l, i) => (
          <line key={`f${l.mes}`} x1={x(i)} x2={x(i)} y1={y(Number(l.maior_custo))} y2={y(Number(l.menor_custo))}
            stroke="currentColor" strokeOpacity={0.18} strokeWidth={6} strokeLinecap="round" />
        ))}
        <path d={caminho} fill="none" stroke="currentColor" strokeOpacity={0.7} strokeWidth={2} strokeLinejoin="round" />
        {linhas.map((l, i) => (
          <g key={l.mes}>
            <circle cx={x(i)} cy={y(Number(l.custo_medio))} r={5} fill={cor(l.status_mensal)} stroke="var(--background)" strokeWidth={2} />
            <text x={x(i)} y={H - 10} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.55}>{mesCurto(l.mes)}</text>
            <circle cx={x(i)} cy={y(Number(l.custo_medio))} r={14} fill="transparent">
              <title>{`${nomeMes(l.mes)} · média ${valor(Number(l.custo_medio))} · menor ${valor(Number(l.menor_custo))} · maior ${valor(Number(l.maior_custo))} · ${l.compras} ${l.compras === 1 ? "compra" : "compras"}`}</title>
            </circle>
          </g>
        ))}
      </svg>
    </figure>
  )
}

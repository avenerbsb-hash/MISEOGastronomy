import { custoPorUnidade, dataCurta, percentual, reais, type Dimensao } from "@/lib/formato"
import type { LinhaHistoricoCusto } from "@/lib/dados"
import { CORES_STATUS } from "@/components/status-preco"

// Linha da oscilação de custo (últimas N alterações). Valores vêm do banco; aqui só se desenha.
// Uma série: sem legenda; ponto vermelho = subiu, verde = caiu, cinza = primeiro/igual; dica ao passar o mouse.
const W = 640, H = 220, E = 64, D = 20, T = 22, B = 34

export function GraficoCusto({ linhas, dimensao, pontos = 10 }: { linhas: LinhaHistoricoCusto[]; dimensao: Dimensao; pontos?: number }) {
  // linhas chegam do mais recente para o mais antigo
  const serie = linhas.slice(0, pontos).reverse()
  if (serie.length < 2) return null
  const valor = (v: number) => (dimensao === "contagem" ? reais(v) : custoPorUnidade(v, dimensao))

  const vs = serie.map((l) => Number(l.custo))
  let min = Math.min(...vs), max = Math.max(...vs)
  const folga = (max - min) * 0.15 || max * 0.05 || 1
  min -= folga; max += folga
  const x = (i: number) => E + (i * (W - E - D)) / (serie.length - 1)
  const y = (v: number) => T + ((max - v) * (H - T - B)) / (max - min)
  const grade = [0, 1, 2].map((k) => min + ((max - min) * (k + 0.5)) / 3)
  const caminho = serie.map((l, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(Number(l.custo)).toFixed(1)}`).join(" ")
  const corPonto = (l: LinhaHistoricoCusto) =>
    l.custo_anterior == null || l.sinal === "neutro" ? CORES_STATUS.estavel.texto : l.sinal === "verde" ? CORES_STATUS.caiu.texto : CORES_STATUS.subiu.texto
  // texto único (vários nós de texto dentro de <title> quebram a hidratação)
  const dica = (l: LinhaHistoricoCusto) => {
    const variacao = l.custo_anterior != null && l.variacao_pct != null
      ? `${l.sinal === "vermelho" ? "▲" : l.sinal === "verde" ? "▼" : "="} ${percentual(l.variacao_pct, true)}`
      : "primeiro registro"
    return `${dataCurta(l.data)} · ${valor(Number(l.custo))} · ${variacao}\ncompra de ${l.insumos}`
  }
  const ultimo = serie.length - 1
  // datas: todas quando cabem; senão, alternadas (sempre a primeira e a última)
  const passo = serie.length > 8 ? 2 : 1

  return (
    <figure className="grid gap-1">
      <figcaption className="text-xs text-muted-foreground">
        Oscilação do custo — {serie.length === linhas.length ? "todas as alterações" : `últimas ${serie.length} alterações`}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-3xl text-foreground" role="img"
        aria-label={`Custo de ${valor(vs[0])} em ${dataCurta(serie[0].data)} a ${valor(vs[ultimo])} em ${dataCurta(serie[ultimo].data)}`}>
        {grade.map((g) => (
          <g key={g}>
            <line x1={E} x2={W - D} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity={0.08} />
            <text x={E - 8} y={y(g) + 3} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.55}>{valor(g)}</text>
          </g>
        ))}
        <path d={caminho} fill="none" stroke="currentColor" strokeOpacity={0.7} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {serie.map((l, i) => (
          <g key={l.data}>
            <circle cx={x(i)} cy={y(Number(l.custo))} r={5} fill={corPonto(l)} stroke="var(--background)" strokeWidth={2} />
            {i % passo === 0 || i === ultimo ? (
              <text x={x(i)} y={H - 12} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.55}>{dataCurta(l.data).slice(0, 5)}</text>
            ) : null}
            {/* área de toque maior que o ponto, com a dica */}
            <circle cx={x(i)} cy={y(Number(l.custo))} r={14} fill="transparent">
              <title>{dica(l)}</title>
            </circle>
          </g>
        ))}
        {/* rótulo direto só no valor atual */}
        <text x={x(ultimo)} y={y(vs[ultimo]) - 10} textAnchor="end" fontSize={11} fontWeight={600} fill="currentColor">{valor(vs[ultimo])}</text>
      </svg>
    </figure>
  )
}

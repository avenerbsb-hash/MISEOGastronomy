import { cn } from "@/lib/utils"

export type Tom = "alta" | "queda" | "neutro"

// Cor pelo efeito no negócio: subir custo/CMV = vermelho, cair = verde, sem mudança = cinza
const COR: Record<Tom, string> = { alta: "var(--alta)", queda: "var(--queda)", neutro: "var(--neutro)" }

// Mini gráfico de tendência. Só desenha os valores recebidos do banco (null = sem dado naquele ponto).
// Escala com faixa mínima de 10% do valor médio: variação pequena aparece quase reta, sem "degrau" exagerado.
// minimo: quantos pontos com dado são necessários (abaixo disso mostra o texto "falta")
export function Sparkline({ valores, tom = "neutro", rotulo, className, minimo = 2, falta = "sem histórico suficiente" }: {
  valores: (number | null | undefined)[]; tom?: Tom; rotulo: string; className?: string; minimo?: number; falta?: string
}) {
  const L = 100, A = 28, M = 3
  const nums = valores.map((v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v)))
  const validos = nums.filter((v): v is number => v != null)
  if (validos.length < Math.max(minimo, 2)) {
    return <span className={cn("block whitespace-nowrap text-xs text-muted-foreground", className)}>{falta}</span>
  }
  const menor = Math.min(...validos), maior = Math.max(...validos)
  const media = validos.reduce((a, v) => a + v, 0) / validos.length
  const faixa = Math.max(maior - menor, Math.abs(media) * 0.1, 1e-9)
  const base = (maior + menor) / 2 - faixa / 2
  const passo = (L - 2 * M) / Math.max(nums.length - 1, 1)
  const y = (v: number) => A - M - ((v - base) / faixa) * (A - 2 * M)
  // trechos contínuos (um ponto sem dado interrompe a linha)
  const trechos: { x: number; y: number }[][] = [[]]
  nums.forEach((v, i) => {
    if (v == null) { if (trechos.at(-1)!.length) trechos.push([]); return }
    trechos.at(-1)!.push({ x: M + i * passo, y: y(v) })
  })
  const linhas = trechos.filter((t) => t.length)
  const pontos = linhas.flat()
  const cor = COR[tom]
  // poucos pontos: marca cada um; sempre marca o último (traço de comprimento zero = bolinha que não deforma)
  const marcados = pontos.length <= 6 ? pontos : [pontos.at(-1)!]
  return (
    <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" role="img" aria-label={rotulo}
      className={cn("block h-7 w-full overflow-visible", className)}>
      {linhas.map((t, i) => (
        <g key={i}>
          {t.length > 1 ? (
            <path d={`M${t[0].x},${A} ${t.map((p) => `L${p.x},${p.y}`).join(" ")} L${t.at(-1)!.x},${A} Z`} fill={cor} opacity={0.08} />
          ) : null}
          <polyline points={t.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={cor} strokeWidth={1.5}
            vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </g>
      ))}
      {marcados.map((p, i) => (
        <path key={i} d={`M${p.x},${p.y} l0,0`} stroke={cor} strokeWidth={i === marcados.length - 1 ? 5 : 3.5}
          strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}

// Tom pelo efeito no negócio de uma mudança em algo que é ruim subir (custo, CMV, pendências)
export function tomDe(variacao: number | null | undefined): Tom {
  if (variacao == null || Number(variacao) === 0) return "neutro"
  return Number(variacao) > 0 ? "alta" : "queda"
}

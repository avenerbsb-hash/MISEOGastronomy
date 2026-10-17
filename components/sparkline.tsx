import { cn } from "@/lib/utils"

export type Tom = "alta" | "queda" | "neutro"

// Cor pelo efeito no negócio: subir custo/CMV = vermelho, cair = verde, sem mudança = cinza
const COR: Record<Tom, string> = { alta: "var(--alta)", queda: "var(--queda)", neutro: "var(--neutro)" }

// Mini gráfico de tendência. Só desenha os valores recebidos do banco (null = sem dado naquele ponto).
export function Sparkline({ valores, tom = "neutro", rotulo, className }: {
  valores: (number | null | undefined)[]; tom?: Tom; rotulo: string; className?: string
}) {
  const L = 100, A = 28, M = 2
  const nums = valores.map((v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v)))
  const validos = nums.filter((v): v is number => v != null)
  if (validos.length < 2) {
    return <span className={cn("block text-[11px] text-muted-foreground", className)}>sem histórico suficiente</span>
  }
  const min = Math.min(...validos), max = Math.max(...validos)
  const passo = (L - 2 * M) / Math.max(nums.length - 1, 1)
  const y = (v: number) => (max === min ? A / 2 : A - M - ((v - min) / (max - min)) * (A - 2 * M))
  // trechos contínuos (um ponto sem dado interrompe a linha)
  const trechos: { x: number; y: number }[][] = []
  nums.forEach((v, i) => {
    if (v == null) { trechos.push([]); return }
    if (!trechos.length) trechos.push([])
    trechos[trechos.length - 1].push({ x: M + i * passo, y: y(v) })
  })
  const linhas = trechos.filter((t) => t.length)
  const cor = COR[tom]
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
    </svg>
  )
}

// Tom pelo efeito no negócio de uma mudança em algo que é ruim subir (custo, CMV, pendências)
export function tomDe(variacao: number | null | undefined): Tom {
  if (variacao == null || Number(variacao) === 0) return "neutro"
  return Number(variacao) > 0 ? "alta" : "queda"
}

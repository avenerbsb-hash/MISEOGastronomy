import { dataCurta, percentual } from "@/lib/formato"
import { cn } from "@/lib/utils"

// Variação de custo: queda = verde, alta = vermelho, igual = neutro; sempre com data e casa
export function Variacao({
  sinal, pct, data, casa, compacto = false,
}: { sinal: string | null; pct: number | null; data: string | null; casa: string; compacto?: boolean }) {
  const tipo = sinal === "verde" ? "queda" : sinal === "vermelho" ? "alta" : "neutro"
  const icone = tipo === "queda" ? "▼" : tipo === "alta" ? "▲" : "="
  const texto = tipo === "queda" ? "Caiu" : tipo === "alta" ? "Subiu" : pct == null ? "Sem comparação" : "Igual"
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
          tipo === "queda" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
          tipo === "alta" && "bg-red-500/10 text-red-700 dark:text-red-400",
          tipo === "neutro" && "bg-muted text-muted-foreground",
        )}
      >
        <span aria-hidden>{icone}</span>
        {texto}{pct != null && pct !== 0 ? ` ${percentual(pct, true)}` : ""}
      </span>
      <span className="text-xs text-muted-foreground">
        {compacto ? dataCurta(data) : `compra de ${dataCurta(data)} · ${casa}`}
      </span>
    </span>
  )
}

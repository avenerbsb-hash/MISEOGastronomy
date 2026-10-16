import { percentual, reais } from "@/lib/formato"
import { CORES_STATUS } from "@/components/status-preco"
import { cn } from "@/lib/utils"

// Do preço ao resultado na ponta, linha a linha (demonstrativo_item, 0013)
export type LinhaDemonstrativo = { ordem: number; rotulo: string; pct: number; valor: number; tipo: "total" | "custo" | "variavel" | "subtotal" | "estrutura" | "resultado" | "alvo" }

export function Demonstrativo({ linhas }: { linhas: LinhaDemonstrativo[] }) {
  const alvo = linhas.find((l) => l.tipo === "alvo")
  const resultado = linhas.find((l) => l.tipo === "resultado")
  const cor = !resultado || !alvo ? CORES_STATUS.estavel
    : resultado.valor < 0 ? CORES_STATUS.subiu : resultado.pct < alvo.pct - 0.05 ? CORES_STATUS.sem_comparacao : CORES_STATUS.caiu
  return (
    <table className="w-full text-sm">
      <tbody>
        {linhas.filter((l) => l.tipo !== "alvo" && (l.tipo !== "variavel" || Number(l.pct) > 0)).map((l) => {
          const destaque = l.tipo === "total" || l.tipo === "subtotal" || l.tipo === "resultado"
          return (
            <tr key={l.ordem} className={cn(destaque && "border-t font-medium", l.tipo === "resultado" && "text-base")}>
              <td className={cn("py-1.5 pr-2", !destaque && "pl-3 text-muted-foreground")}>{destaque ? "" : "(−) "}{l.rotulo}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{percentual(l.pct)}</td>
              <td className="py-1.5 text-right tabular-nums" style={l.tipo === "resultado" ? { color: cor.texto } : undefined}>{reais(l.valor)}</td>
            </tr>
          )
        })}
        {alvo && resultado ? (
          <tr>
            <td colSpan={3} className="pt-2">
              <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ color: cor.texto, backgroundColor: cor.fundo }}>
                {resultado.valor < 0 ? "Prejuízo na ponta"
                  : resultado.pct < alvo.pct - 0.05 ? `Abaixo do alvo de ${percentual(alvo.pct)} (${reais(alvo.valor)})`
                  : `Cobre o alvo de ${percentual(alvo.pct)} de investimento / lucro`}
              </span>
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  )
}

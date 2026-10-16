import { dataCurta } from "@/lib/formato"
import { pctPreciso } from "@/components/indicador-preco"
import { CORES_STATUS, statusDoSinal, type StatusPreco } from "@/components/status-preco"

const ROTULO: Record<StatusPreco, string> = {
  subiu: "Subiu", caiu: "Caiu", estavel: "Estável", sem_comparacao: "Sem comparação", sem_preco: "Sem preço",
}

// Badge de status do preço: ▲ +12,5% (vermelho) · ▼ −8,3% (verde) · = 0,0% (cinza) · Sem comparação · Sem preço
export function BadgeVariacao({ sinal, pct, temPreco = true }: { sinal?: string | null; pct?: number | null; temPreco?: boolean }) {
  const status = statusDoSinal(sinal, pct, temPreco)
  const cor = CORES_STATUS[status]
  let texto: string
  if (status === "subiu" || status === "caiu") {
    // casas decimais suficientes para não mostrar 0,0% numa variação que existe
    texto = `${status === "subiu" ? "▲" : "▼"} ${pctPreciso(Number(pct))}`
  } else if (status === "estavel") {
    texto = "= 0,0%"
  } else {
    texto = ROTULO[status]
  }
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
      style={{ color: cor.texto, backgroundColor: cor.fundo }}
      title={ROTULO[status]}
    >
      {texto}
    </span>
  )
}

// Variação de custo com a referência: sempre com data e casa
export function Variacao({
  sinal, pct, data, casa, compacto = false,
}: { sinal: string | null; pct: number | null; data: string | null; casa: string; compacto?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <BadgeVariacao sinal={sinal} pct={pct} />
      <span className="text-xs text-muted-foreground">
        {compacto ? dataCurta(data) : `compra de ${dataCurta(data)} · ${casa}`}
      </span>
    </span>
  )
}

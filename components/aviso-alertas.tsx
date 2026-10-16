import Link from "next/link"
import { CORES_STATUS } from "@/components/status-preco"
import { DIAS_ALERTA, LIMITE_ALERTA } from "@/lib/dados"

// Faixa no topo das listas quando há altas acima do limite; leva à tela de Alertas
export function AvisoAlertas({ quantidade, um, varios, ancora }: { quantidade: number; um: string; varios: string; ancora: string }) {
  if (!quantidade) return null
  const cor = CORES_STATUS.subiu
  return (
    <Link href={`/alertas#${ancora}`}
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-sm hover:opacity-90"
      style={{ color: cor.texto, backgroundColor: cor.fundo }}>
      <span>
        <b>▲ {quantidade} {quantidade === 1 ? um : varios}</b> mais de {LIMITE_ALERTA}% nos últimos {DIAS_ALERTA} dias
      </span>
      <span className="font-medium underline">Ver alertas</span>
    </Link>
  )
}

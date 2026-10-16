import type { Metadata } from "next"
import { exigirCustos } from "@/lib/sessao"
import { alertasDaCasa, DIAS_ALERTA } from "@/lib/dados"
import { PainelAlertas, PERIODOS } from "@/components/painel-alertas"

export const metadata: Metadata = { title: "Alertas" }

export default async function Alertas({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const s = await exigirCustos()
  const { dias: d } = await searchParams
  const dias = PERIODOS.includes(Number(d)) ? Number(d) : DIAS_ALERTA
  const { insumos, fichas, erro } = await alertasDaCasa(s.casa.id, dias)
  return <PainelAlertas insumos={insumos} fichas={fichas} dias={dias} casa={s.casa.nome} erro={erro} />
}

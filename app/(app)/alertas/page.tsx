import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { alertasDaCasa, DIAS_ALERTA } from "@/lib/dados"
import { PainelAlertas, PERIODOS } from "@/components/painel-alertas"

export const metadata: Metadata = { title: "Alertas" }

export default async function Alertas({ searchParams }: { searchParams: Promise<{ dias?: string; uso?: string }> }) {
  const s = await exigirCustos()
  const { dias: d, uso } = await searchParams
  const dias = PERIODOS.includes(Number(d)) ? Number(d) : DIAS_ALERTA
  const supabase = await createClient()
  const [{ insumos, fichas, erro }, { data: casa }] = await Promise.all([
    alertasDaCasa(s.casa.id, dias),
    supabase.from("estabelecimentos").select("cmv_alvo_padrao").eq("id", s.casa.id).maybeSingle(),
  ])
  return <PainelAlertas insumos={insumos} fichas={fichas} dias={dias} casa={s.casa.nome} erro={erro}
    meta={Number(casa?.cmv_alvo_padrao ?? 30)} uso={uso === "fichas" ? "fichas" : ""} />
}

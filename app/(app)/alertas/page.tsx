import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { alertasDaCasa, DIAS_ALERTA } from "@/lib/dados"
import { ORDENS_ALERTA, PainelAlertas, PERIODOS, type OrdemAlerta } from "@/components/painel-alertas"
import { AlertasNiveis, JANELAS, NOMES_GRUPO, type AlertaNivel } from "@/components/alertas-niveis"

export const metadata: Metadata = { title: "Alertas" }

export default async function Alertas({ searchParams }: {
  searchParams: Promise<{ dias?: string; uso?: string; ordem?: string; janela?: string; nivel?: string; grupo?: string }>
}) {
  const s = await exigirCustos()
  const sp = await searchParams
  const dias = PERIODOS.includes(Number(sp.dias)) ? Number(sp.dias) : DIAS_ALERTA
  const janela = JANELAS.includes(Number(sp.janela)) ? Number(sp.janela) : 30
  const nivel = [1, 2, 3].includes(Number(sp.nivel)) ? Number(sp.nivel) : 0
  const grupo = sp.grupo && sp.grupo in NOMES_GRUPO ? sp.grupo : ""
  const supabase = await createClient()
  const [{ insumos, fichas, erro }, { data: casa }, niveis] = await Promise.all([
    alertasDaCasa(s.casa.id, dias),
    supabase.from("estabelecimentos").select("cmv_alvo_padrao").eq("id", s.casa.id).maybeSingle(),
    // níveis por grupo (0026): fichas do cardápio, acumulado do período
    supabase.rpc("alertas_fichas_niveis", { p_estab: s.casa.id, p_dias: janela }),
  ])
  return (
    <div className="grid gap-8">
      <h1 className="-mb-5 text-xl font-semibold">Alertas</h1>
      <AlertasNiveis linhas={(niveis.data ?? []) as AlertaNivel[]} janela={janela} nivel={nivel} grupo={grupo} erro={!!niveis.error} />
      <PainelAlertas insumos={insumos} fichas={fichas} dias={dias} casa={s.casa.nome} erro={erro}
        meta={Number(casa?.cmv_alvo_padrao ?? 30)} uso={sp.uso === "fichas" ? "fichas" : ""}
        ordem={sp.ordem && sp.ordem in ORDENS_ALERTA ? (sp.ordem as OrdemAlerta) : "relevancia"} />
    </div>
  )
}

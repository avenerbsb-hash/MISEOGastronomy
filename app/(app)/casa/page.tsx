import type { Metadata } from "next"
import { exigirCustos } from "@/lib/sessao"
import { FormAcao, BotaoEnviar } from "@/components/form-acao"
import { EnviarLogo } from "@/components/enviar-logo"
import { FormLimites, type LimiteGrupo } from "@/components/form-limites"
import { NOMES_GRUPO, type Grupo } from "@/components/alertas-niveis"
import { createClient } from "@/lib/supabase/server"
import { enviarLogo, removerLogo, salvarLimites } from "./actions"

export const metadata: Metadata = { title: "Dados da casa" }

// Dados da casa (gestor/admin): logo do topo e dos PDFs e limites dos alertas das fichas
export default async function DadosCasa() {
  const s = await exigirCustos()
  const supabase = await createClient()
  const { data: limites, error: semLimites } = await supabase.rpc("limites_alerta_casa", { p_estab: s.casa.id })
  return (
    <div className="grid max-w-3xl gap-4">
      <div>
        <h1 className="text-xl font-semibold">Dados da casa</h1>
        <p className="text-sm text-muted-foreground">{s.casa.nome}</p>
      </div>
      <section className="grid gap-3 rounded-xl border p-4">
        <h2 className="text-base font-semibold">Logo</h2>
        <p className="text-sm text-muted-foreground">Aparece no topo do sistema e nos PDFs (pedido de compra, painel de CMV e relatório de insumos) desta casa.</p>
        {s.casa.logo ? (
          <div className="flex flex-wrap items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.casa.logo} alt={`Logo de ${s.casa.nome}`} className="h-20 w-auto max-w-full rounded-md border object-contain p-1" />
            <FormAcao acao={removerLogo} className="gap-1">
              <BotaoEnviar variant="ghost" className="h-11 px-3 text-sm text-muted-foreground" enviando="Removendo…">Remover logo</BotaoEnviar>
            </FormAcao>
          </div>
        ) : <p className="text-sm text-muted-foreground">Esta casa ainda não tem logo.</p>}
        <EnviarLogo acao={enviarLogo} />
      </section>
      <section id="limites" className="grid scroll-mt-20 gap-3 rounded-xl border p-4">
        <h2 className="text-base font-semibold">Limites dos alertas de fichas</h2>
        <p className="text-sm text-muted-foreground">
          Cada ficha do cardápio é comparada com o período escolhido em Alertas (acumulado). Custo: alta em % que leva a
          atenção, alerta ou crítico. CMV: subida em pontos que já dá atenção, e quantos pontos acima da meta tornam crítico
          (passar da meta já é alerta). Drinks e pratos começam mais sensíveis.
        </p>
        {semLimites ? <p className="text-sm text-muted-foreground">Os limites de alerta ainda não estão ativos (migração 0026).</p>
          : ((limites ?? []) as LimiteGrupo[]).map((l) => (
            <FormLimites key={l.grupo} limite={l} nome={NOMES_GRUPO[l.grupo as Grupo] ?? l.grupo} acao={salvarLimites} />
          ))}
      </section>
    </div>
  )
}

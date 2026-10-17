import type { Metadata } from "next"
import { exigirCustos } from "@/lib/sessao"
import { FormAcao, BotaoEnviar } from "@/components/form-acao"
import { EnviarLogo } from "@/components/enviar-logo"
import { enviarLogo, removerLogo } from "./actions"

export const metadata: Metadata = { title: "Dados da casa" }

// Dados da casa (gestor/admin): por enquanto, a logo usada no topo do sistema e nos PDFs
export default async function DadosCasa() {
  const s = await exigirCustos()
  return (
    <div className="grid max-w-2xl gap-4">
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
    </div>
  )
}

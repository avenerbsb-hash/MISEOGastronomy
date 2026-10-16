import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { PainelCmv, FILTROS_CMV, type LinhaCmv } from "@/components/painel-cmv"
import { FormAcao, BotaoEnviar } from "@/components/form-acao"
import { Entrada } from "@/components/campos"
import { definirMetaCmv } from "./actions"

export const metadata: Metadata = { title: "CMV" }

export default async function Cmv({ searchParams }: { searchParams: Promise<{ situacao?: string }> }) {
  const s = await exigirCustos()
  const { situacao = "" } = await searchParams
  const filtro = FILTROS_CMV.some((f) => f.valor === situacao) ? situacao : ""
  const supabase = await createClient()
  const [painel, casa] = await Promise.all([
    supabase.rpc("painel_cmv_casa", { p_estab: s.casa.id }),
    supabase.rpc("cmv_da_casa", { p_estab: s.casa.id }),
  ])
  if (painel.error) return <p className="text-sm text-destructive">Não foi possível carregar o painel de CMV.</p>
  const linhas = (painel.data ?? []) as LinhaCmv[]
  const media = ((casa.data ?? []) as { cmv_medio_simples_pct: number | null }[])[0]?.cmv_medio_simples_pct ?? null
  const meta = linhas[0]?.meta_pct ?? 30
  const metaDefinida = linhas[0]?.meta_definida ?? false

  const formMeta = s.admin ? (
    <details className="mt-1 text-sm">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:underline">Alterar meta</summary>
      <FormAcao acao={definirMetaCmv} limparAoSalvar={false} className="mt-2 gap-2">
        <div className="flex items-center gap-2">
          <Entrada name="meta" inputMode="decimal" defaultValue={String(meta).replace(".", ",")} aria-label="Meta de CMV (%)" className="h-9 w-20 text-right" />
          <span className="text-muted-foreground">%</span>
          <BotaoEnviar variant="outline" className="h-9 px-3">Salvar</BotaoEnviar>
        </div>
      </FormAcao>
    </details>
  ) : null

  return <PainelCmv linhas={linhas} filtro={filtro} media={media} meta={Number(meta)} metaDefinida={metaDefinida} casa={s.casa.nome} formMeta={formMeta} />
}

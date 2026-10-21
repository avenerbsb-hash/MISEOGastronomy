import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { daCasa } from "@/lib/dados"
import { exigirGerencia } from "@/lib/sessao"
import { FormAcao, BotaoEnviar } from "@/components/form-acao"
import { Entrada } from "@/components/campos"
import { NovoItemEstoque } from "@/components/novo-item-estoque"
import { cn } from "@/lib/utils"
import { alternarItemEstoque, salvarItemEstoque } from "../actions"

export const metadata: Metadata = { title: "Itens do estoque" }

type Item = {
  id: string; insumo_id: string; unidade_compra: string; conteudo: number | null; estoque_minimo: number; ativo: boolean
  insumos: { nome: string; dimensao: string } | null
}
const UNIDADE_BASE: Record<string, string> = { massa: "g", volume: "mL", contagem: "un" }
const br = (v: number | null) => (v == null ? "" : String(v).replace(".", ","))

// Itens controlados, estoque mínimo e unidade de compra (gestor/admin)
export default async function ItensEstoque() {
  const s = await exigirGerencia()
  const supabase = await createClient()
  const [itens, insumos] = await Promise.all([
    supabase.from("estoque_itens").select("id, insumo_id, unidade_compra, conteudo, estoque_minimo, ativo, insumos(nome, dimensao)")
      .eq("estabelecimento_id", s.casa.id),
    supabase.from("insumos").select("id, nome").eq("ativo", true).or(daCasa(s.casa.id)).order("nome"),
  ])
  if (itens.error) return <p className="text-sm text-muted-foreground">O controle de estoque ainda não está ativo nesta base (migração 0019).</p>
  const lista = ((itens.data ?? []) as unknown as Item[]).sort((a, b) =>
    Number(b.ativo) - Number(a.ativo) || (a.insumos?.nome ?? "").localeCompare(b.insumos?.nome ?? "", "pt-BR"))
  const controlados = new Set(lista.filter((i) => i.ativo).map((i) => i.insumo_id))

  return (
    <div className="grid gap-5">
      <section className="grid gap-2 rounded-xl border p-4">
        <h2 className="text-base font-semibold">Incluir item</h2>
        <NovoItemEstoque acao={salvarItemEstoque} insumos={(insumos.data ?? []).filter((i) => !controlados.has(i.id))} />
      </section>

      <section className="grid gap-2">
        <h2 className="text-base font-semibold">Itens controlados <span className="text-sm font-normal text-muted-foreground">({controlados.size})</span></h2>
        <p className="text-sm text-muted-foreground">
          Unidade de compra é como o item é contado e pedido (garrafa, unidade, kg…). O conteúdo (em g, mL ou un) serve só para o valor estimado do pedido.
        </p>
        {lista.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum item ainda.</p> : (
          <ul className="divide-y rounded-xl border">
            {lista.map((i) => (
              <li key={i.id} className={cn("grid gap-2 px-3 py-2.5", !i.ativo && "bg-muted/40 text-muted-foreground")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{i.insumos?.nome}{!i.ativo ? " · fora do controle" : ""}</span>
                  <FormAcao acao={alternarItemEstoque.bind(null, i.id, !i.ativo)} className="gap-1">
                    <BotaoEnviar variant="ghost" className="h-9 px-2 text-xs" enviando="…">{i.ativo ? "Tirar do controle" : "Voltar ao controle"}</BotaoEnviar>
                  </FormAcao>
                </div>
                {i.ativo ? (
                  <FormAcao acao={salvarItemEstoque} limparAoSalvar={false} className="grid-cols-2 items-end gap-2 sm:grid-cols-[8rem_7rem_9rem_auto]">
                    <input type="hidden" name="insumo_id" value={i.insumo_id} />
                    <label className="grid gap-1 text-xs text-muted-foreground">Unidade
                      <Entrada name="unidade_compra" defaultValue={i.unidade_compra} maxLength={30} required className="h-10" />
                    </label>
                    <label className="grid gap-1 text-xs text-muted-foreground">Mínimo
                      <Entrada name="estoque_minimo" inputMode="decimal" defaultValue={br(i.estoque_minimo)} required className="h-10" />
                    </label>
                    <label className="grid gap-1 text-xs text-muted-foreground">Conteúdo ({UNIDADE_BASE[i.insumos?.dimensao ?? ""] ?? "base"})
                      <Entrada name="conteudo" inputMode="decimal" defaultValue={br(i.conteudo)} className="h-10" />
                    </label>
                    <BotaoEnviar variant="outline" className="h-10 px-4">Salvar</BotaoEnviar>
                  </FormAcao>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

import type { Metadata } from "next"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { exigirCasa, podeVerCustos } from "@/lib/sessao"
import { dataCurta, dataHora, numero } from "@/lib/formato"
import { FormAcao, BotaoEnviar } from "@/components/form-acao"
import { Entrada } from "@/components/campos"
import { registrarContagem } from "../actions"

export const metadata: Metadata = { title: "Contagem de estoque" }

type Linha = {
  insumo_id: string; insumo: string; grupo: string; unidade_compra: string; estoque_minimo: number
  deposito: number | null; bar: number | null; atual: number | null; data_contagem: string | null
}

// Contagem do estoque: depósito + bar por item. Em branco = não contado (vale a contagem anterior).
export default async function Contagem() {
  const s = await exigirCasa()
  const supabase = await createClient()
  const [pedido, historico, comResponsavel] = await Promise.all([
    supabase.rpc("pedido_semanal", { p_estab: s.casa.id }),
    supabase.from("contagens_estoque").select("id, data, observacao, criado_em, contagem_itens(count)")
      .eq("estabelecimento_id", s.casa.id).order("data", { ascending: false }).order("criado_em", { ascending: false }).limit(10),
    // com responsável e hora (0023); sem a migração, só data e itens
    supabase.rpc("ultimas_contagens", { p_estab: s.casa.id, p_limite: 10 }),
  ])
  if (pedido.error) return <p className="text-sm text-muted-foreground">O controle de estoque ainda não está ativo nesta base (migração 0019).</p>
  const linhas = (pedido.data ?? []) as Linha[]
  if (!linhas.length) {
    return (
      <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
        Nenhum item controlado nesta casa.{podeVerCustos(s) ? <> <Link href="/estoque/itens" className="underline">Cadastre os itens</Link> para contar.</> : null}
      </p>
    )
  }
  const grupos = [...new Set(linhas.map((l) => l.grupo))]
  type Hist = { id: string; data: string; feita_em: string | null; responsavel: string | null; observacao: string | null; itens: number }
  const contagens: Hist[] = !comResponsavel.error
    ? ((comResponsavel.data ?? []) as { contagem_id: string; data: string; feita_em: string; responsavel: string; observacao: string | null; itens: number }[])
        .map((c) => ({ id: c.contagem_id, data: c.data, feita_em: c.feita_em, responsavel: c.responsavel, observacao: c.observacao, itens: c.itens }))
    : ((historico.data ?? []) as unknown as { id: string; data: string; observacao: string | null; contagem_itens: { count: number }[] }[])
        .map((c) => ({ id: c.id, data: c.data, feita_em: null, responsavel: null, observacao: c.observacao, itens: c.contagem_itens?.[0]?.count ?? 0 }))

  return (
    <div className="grid gap-4">
      <FormAcao acao={registrarContagem} limparAoSalvar={false} className="gap-3">
        <p className="text-sm text-muted-foreground">
          Conte em <b>{linhas[0]?.unidade_compra ? "unidades de compra" : "unidades"}</b> (garrafa, unidade, kg…). Deixe em branco o que não contou: vale a contagem anterior.
        </p>
        <div className="overflow-hidden rounded-xl border">
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] gap-2 border-b bg-muted/50 px-3 py-2 text-xs text-muted-foreground sm:grid-cols-[minmax(0,1fr)_7rem_7rem_8rem]">
            <span>Item</span><span className="text-center">Depósito</span><span className="text-center">Bar</span>
            <span className="hidden text-right sm:block">Última contagem</span>
          </div>
          {grupos.map((g) => (
            <div key={g}>
              <div className="border-b bg-muted/30 px-3 py-1.5 text-xs font-semibold">{g}</div>
              <ul className="divide-y border-b">
                {linhas.filter((l) => l.grupo === g).map((l) => (
                  <li key={l.insumo_id} className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_8rem]">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{l.insumo}</div>
                      <div className="text-xs text-muted-foreground">{l.unidade_compra}{s.papel === "contagem" ? "" : ` · mínimo ${numero(l.estoque_minimo)}`}</div>
                    </div>
                    <Entrada name={`dep_${l.insumo_id}`} inputMode="decimal" aria-label={`Depósito: ${l.insumo}`}
                      placeholder={l.deposito != null ? numero(l.deposito) : "—"} className="h-11 text-center" />
                    <Entrada name={`bar_${l.insumo_id}`} inputMode="decimal" aria-label={`Bar: ${l.insumo}`}
                      placeholder={l.bar != null ? numero(l.bar) : "—"} className="h-11 text-center" />
                    <span className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">
                      {l.atual != null ? `${numero(l.atual)} em ${dataCurta(l.data_contagem)}` : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <Entrada name="observacao" maxLength={300} placeholder="Observação (opcional): ex. contagem de segunda, antes da entrega" aria-label="Observação" className="h-11" />
        <div><BotaoEnviar className="h-11 px-5" enviando="Salvando contagem…">Salvar contagem</BotaoEnviar></div>
      </FormAcao>

      <section className="grid gap-2">
        <h2 className="text-base font-semibold">Contagens anteriores</h2>
        {contagens.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma contagem ainda.</p> : (
          <ul className="divide-y rounded-xl border text-sm">
            {contagens.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  {c.feita_em ? dataHora(c.feita_em).replace(", ", " às ") : dataCurta(c.data)}
                  {c.responsavel ? <> · <b>{c.responsavel}</b></> : null}
                  {c.observacao ? <span className="text-muted-foreground"> · {c.observacao}</span> : null}
                </span>
                <span className="text-xs text-muted-foreground">{c.itens} itens contados</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

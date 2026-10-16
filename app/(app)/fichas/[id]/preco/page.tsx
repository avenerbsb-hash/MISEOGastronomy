import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { dataHora, percentual, reais } from "@/lib/formato"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { definirPreco } from "../../actions"
import { FormPreco, type Sugestao } from "./form-preco"

type LinhaPainel = {
  item_id: string; cardapio: string; custo_porcao: number | null; preco_publicado: number | null; cmv_atual_pct: number | null
  cmv_alvo_pct: number | null; preco_sugerido_arredondado: number | null; preco_sugerido_margem_arredondado: number | null
  margem_atual: number | null; margem_referencia: number | null
}
type Historico = { preco: number; vigente_desde: string; cmv_no_momento: number | null; custo_no_momento: number | null; motivo: string | null }

export default async function PrecoVenda({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirCustos()
  const { id } = await params
  const supabase = await createClient()

  const [{ data: itens }, { data: painel }, custo, { data: painelCasa }] = await Promise.all([
    supabase.from("itens_cardapio").select("id, cardapios!inner(estabelecimento_id)").eq("receita_id", id).eq("cardapios.estabelecimento_id", s.casa.id),
    supabase.rpc("painel_cmv", { p_estab: s.casa.id }),
    supabase.rpc("custo_receita", { p_receita: id, p_estab: s.casa.id }),
    // meta da casa (0011)
    supabase.rpc("painel_cmv_casa", { p_estab: s.casa.id }),
  ])
  const idsItens = new Set((itens ?? []).map((i) => i.id as string))
  const linha = ((painel ?? []) as LinhaPainel[]).find((l) => idsItens.has(l.item_id))
  const { data: hist } = linha
    ? await supabase.from("precos_item_cardapio")
        .select("preco, vigente_desde, cmv_no_momento, custo_no_momento, motivo")
        .eq("item_id", linha.item_id).order("vigente_desde", { ascending: false })
    : { data: [] }
  const historico = (hist ?? []) as Historico[]
  const custoAtual = (custo.data as number | null) ?? null

  const sugestoes: Sugestao[] = []
  if (linha?.preco_sugerido_arredondado) {
    sugestoes.push({ rotulo: "Manter CMV do item", detalhe: `CMV de referência ${percentual(linha.cmv_alvo_pct)}`, valor: Number(linha.preco_sugerido_arredondado) })
  }
  const meta = ((painelCasa ?? []) as { item_id: string; preco_meta: number | null; meta_pct: number }[]).find((l) => l.item_id === linha?.item_id)
  if (meta?.preco_meta) {
    sugestoes.push({ rotulo: "Atingir a meta da casa", detalhe: `CMV de ${percentual(meta.meta_pct)}`, valor: Number(meta.preco_meta) })
  }
  if (linha?.preco_sugerido_margem_arredondado) {
    sugestoes.push({ rotulo: "Manter margem em R$", detalhe: `margem de referência ${reais(linha.margem_referencia)}`, valor: Number(linha.preco_sugerido_margem_arredondado) })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Preço atual em {s.casa.nome}</CardTitle>
          <CardDescription>{linha ? `Cardápio: ${linha.cardapio}` : "Ainda não está no cardápio desta casa. Ao aprovar um preço, a ficha entra no cardápio."}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-2">
          <div><div className="text-xs text-muted-foreground">Custo da porção</div><div className="text-xl tabular-nums">{reais(custoAtual)}</div></div>
          <div><div className="text-xs text-muted-foreground">Preço</div><div className="text-xl font-semibold tabular-nums">{reais(linha?.preco_publicado)}</div></div>
          <div><div className="text-xs text-muted-foreground">CMV</div><div className="text-xl tabular-nums">{percentual(linha?.cmv_atual_pct)}</div></div>
          <div><div className="text-xs text-muted-foreground">Margem</div><div className="text-xl tabular-nums">{reais(linha?.margem_atual)}</div></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Novo preço de venda</CardTitle>
          <CardDescription>Vale a partir de agora. O preço anterior fica no histórico.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormPreco acao={definirPreco.bind(null, id)} atual={linha?.preco_publicado ?? null} sugestoes={sugestoes} />
        </CardContent>
      </Card>

      {historico.length ? (
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Histórico de preços</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">Desde</th><th className="py-1.5 pr-2 text-right font-medium">Preço</th>
                <th className="py-1.5 pr-2 text-right font-medium">Custo na época</th><th className="py-1.5 pr-2 text-right font-medium">CMV na época</th>
                <th className="py-1.5 font-medium">Motivo</th>
              </tr></thead>
              <tbody>
                {historico.map((h, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{dataHora(h.vigente_desde)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{reais(h.preco)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{reais(h.custo_no_momento)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{percentual(h.cmv_no_momento)}</td>
                    <td className="py-1.5 text-muted-foreground">{h.motivo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

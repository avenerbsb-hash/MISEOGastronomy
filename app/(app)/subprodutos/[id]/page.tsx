import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { exigirCasa, podeVerCustos } from "@/lib/sessao"
import { custoPorUnidade, type Dimensao } from "@/lib/formato"
import { FichaProducao, type LinhaProducao } from "@/components/ficha-producao"
import { TabelaCustos, type LinhaGerencial } from "@/components/tabela-custos"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { historicoCusto, variacoesDasReceitas, variacoesDosComponentes } from "@/lib/dados"
import { Variacao } from "@/components/variacao"
import { HistoricoCusto } from "@/components/historico-custo"

export default async function FichaSubproduto({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirCasa()
  const { id } = await params
  const supabase = await createClient()

  const { data: producao } = await supabase
    .from("vw_ficha_producao").select("*").eq("receita_id", id).order("ordem")
  const linhasProducao = (producao ?? []) as LinhaProducao[]

  // Produção: só a ficha sem valores. Nenhuma chamada de custo acontece neste ramo.
  if (!podeVerCustos(s)) return <FichaProducao linhas={linhasProducao} />

  if (!linhasProducao.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Este subproduto ainda não tem versão aprovada. <Link href={`/subprodutos/${id}/rascunho`} className="underline">Abrir o rascunho</Link>.
      </p>
    )
  }

  const [{ data: r }, custo, gerencial, variacoes, historico, componentes] = await Promise.all([
    supabase.from("receitas").select("dimensao_saida").eq("id", id).single(),
    supabase.rpc("custo_receita", { p_receita: id, p_estab: s.casa.id }),
    supabase.rpc("ficha_gerencial", { p_receita: id, p_estab: s.casa.id }),
    variacoesDasReceitas(s.casa.id, "subproduto"),
    historicoCusto(id, s.casa.id),
    variacoesDosComponentes(s.casa.id),
  ])
  const v = variacoes.get(id)
  const dim = (r?.dimensao_saida ?? "massa") as Dimensao
  const linhas = (gerencial.data ?? []) as LinhaGerencial[]

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Custo em {s.casa.nome}</CardTitle>
          <CardDescription>Versão vigente, com o último preço validado de cada insumo</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="text-3xl font-semibold">
            {custo.data != null ? custoPorUnidade(custo.data as number, dim) : <span className="text-base font-normal text-muted-foreground">Falta preço de algum insumo nesta casa</span>}
          </div>
          {v ? <Variacao sinal={v.sinal} pct={v.variacao_pct} data={v.data_referencia} casa={s.casa.nome} /> : null}
          <TabelaCustos linhas={linhas} variacoes={componentes} />
        </CardContent>
      </Card>
      <HistoricoCusto linhas={historico} dimensao={dim} casa={s.casa.nome} />
      <FichaProducao linhas={linhasProducao} />
    </div>
  )
}

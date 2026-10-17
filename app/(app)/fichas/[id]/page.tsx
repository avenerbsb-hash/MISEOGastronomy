import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { exigirCasa, podeVerCustos } from "@/lib/sessao"
import { percentual, reais } from "@/lib/formato"
import { FichaProducao, type LinhaProducao } from "@/components/ficha-producao"
import { TabelaCustos, type LinhaGerencial } from "@/components/tabela-custos"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { precosDasFichas } from "../dados"
import { historicoCusto, variacoesDasReceitas, variacoesDosComponentes } from "@/lib/dados"
import { Variacao } from "@/components/variacao"
import { HistoricoCusto } from "@/components/historico-custo"
import { AvisoRascunho } from "@/components/aviso-rascunho"

export default async function FichaFinal({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirCasa()
  const { id } = await params
  const supabase = await createClient()
  const { data: producao } = await supabase.from("vw_ficha_producao").select("*").eq("receita_id", id).order("ordem")
  const linhasProducao = (producao ?? []) as LinhaProducao[]

  // Produção: só a ficha sem valores. Nenhuma chamada de custo acontece neste ramo.
  if (!podeVerCustos(s)) return <FichaProducao linhas={linhasProducao} />
  if (!linhasProducao.length) {
    return <p className="text-sm text-muted-foreground">Esta ficha ainda não tem versão aprovada. <Link href={`/fichas/${id}/editar`} className="underline">Abrir o rascunho</Link>.</p>
  }

  const [custo, gerencial, precos, variacoes, historico, componentes] = await Promise.all([
    supabase.rpc("custo_receita", { p_receita: id, p_estab: s.casa.id }),
    supabase.rpc("ficha_gerencial", { p_receita: id, p_estab: s.casa.id }),
    precosDasFichas(s.casa.id),
    variacoesDasReceitas(s.casa.id, "final"),
    historicoCusto(id, s.casa.id),
    variacoesDosComponentes(s.casa.id),
  ])
  const v = variacoes.get(id)
  const p = precos.get(id)
  const linhas = (gerencial.data ?? []) as LinhaGerencial[]

  return (
    <div className="grid gap-4">
      <AvisoRascunho receitaId={id} href={`/fichas/${id}/editar`} />
      <Card>
        <CardHeader>
          <CardTitle>Custo em {s.casa.nome}</CardTitle>
          <CardDescription>Versão vigente, com o último preço validado de cada insumo</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <div>
              <div className="text-xs text-muted-foreground">Custo da porção</div>
              <div className="text-3xl font-semibold tabular-nums">
                {custo.data != null ? reais(custo.data as number) : <span className="text-base font-normal text-muted-foreground">Falta preço de algum insumo</span>}
              </div>
              {v ? <div className="mt-1"><Variacao sinal={v.sinal} pct={v.variacao_pct} data={v.data_referencia} casa={s.casa.nome} /></div> : null}
            </div>
            {p?.preco != null ? (
              <>
                <div><div className="text-xs text-muted-foreground">Preço no cardápio</div><div className="text-xl tabular-nums">{reais(p.preco)}</div></div>
                <div>
                  <div className="text-xs text-muted-foreground">CMV</div>
                  <div className={cn("text-xl tabular-nums", Number(p.cmv) > 30 && "font-semibold text-alta")}>{percentual(p.cmv)}</div>
                </div>
                <div><div className="text-xs text-muted-foreground">Margem</div><div className="text-xl tabular-nums">{reais(p.margem)}</div></div>
              </>
            ) : <Link href={`/fichas/${id}/preco`} className="text-sm underline">Definir preço de venda nesta casa</Link>}
          </div>
          <TabelaCustos linhas={linhas} variacoes={componentes} />
        </CardContent>
      </Card>
      <HistoricoCusto linhas={historico} dimensao="contagem" casa={s.casa.nome} />
      <FichaProducao linhas={linhasProducao} />
    </div>
  )
}

import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { exigirCasa, podeVerCustos } from "@/lib/sessao"
import { percentual, reais } from "@/lib/formato"
import { FichaProducao, type LinhaProducao } from "@/components/ficha-producao"
import { TabelaCustos, type LinhaGerencial } from "@/components/tabela-custos"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { precosDasFichas } from "../dados"

export default async function FichaFinal({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirCasa()
  const { id } = await params
  const supabase = await createClient()
  const [{ data: r }, { data: producao }] = await Promise.all([
    supabase.from("receitas").select("codigo, nome, tipo").eq("id", id).maybeSingle(),
    supabase.from("vw_ficha_producao").select("*").eq("receita_id", id).order("ordem"),
  ])
  if (!r || r.tipo !== "final") notFound()
  const linhasProducao = (producao ?? []) as LinhaProducao[]

  const cabecalho = (
    <>
      <div className="mb-2 text-sm"><Link href="/fichas" className="text-muted-foreground hover:underline">← Fichas</Link></div>
      <h1 className="text-xl font-semibold">{r.nome}</h1>
      <p className="mb-3 text-sm text-muted-foreground">{r.codigo}</p>
    </>
  )

  // Produção: só a ficha sem valores. Nenhuma chamada de custo acontece neste ramo.
  if (!podeVerCustos(s)) return <div>{cabecalho}<FichaProducao linhas={linhasProducao} /></div>

  const [custo, gerencial, precos] = await Promise.all([
    supabase.rpc("custo_receita", { p_receita: id, p_estab: s.casa.id }),
    supabase.rpc("ficha_gerencial", { p_receita: id, p_estab: s.casa.id }),
    precosDasFichas(s.casa.id),
  ])
  const p = precos.get(id)
  const linhas = (gerencial.data ?? []) as LinhaGerencial[]

  return (
    <div className="grid gap-4">
      <div>{cabecalho}</div>
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
            </div>
            {p?.preco != null ? (
              <>
                <div><div className="text-xs text-muted-foreground">Preço no cardápio</div><div className="text-xl tabular-nums">{reais(p.preco)}</div></div>
                <div>
                  <div className="text-xs text-muted-foreground">CMV</div>
                  <div className={cn("text-xl tabular-nums", Number(p.cmv) > 30 && "font-semibold text-red-700 dark:text-red-400")}>{percentual(p.cmv)}</div>
                </div>
                <div><div className="text-xs text-muted-foreground">Margem</div><div className="text-xl tabular-nums">{reais(p.margem)}</div></div>
              </>
            ) : <span className="text-sm text-muted-foreground">Fora do cardápio desta casa</span>}
          </div>
          <TabelaCustos linhas={linhas} />
        </CardContent>
      </Card>
      <FichaProducao linhas={linhasProducao} />
    </div>
  )
}

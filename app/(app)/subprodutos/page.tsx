import type { Metadata } from "next"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { exigirProducao, podeVerCustos } from "@/lib/sessao"
import { custoPorUnidade, NOME_DIMENSAO, type Dimensao } from "@/lib/formato"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BuscaLista } from "@/components/busca-lista"
import { custosDasReceitas, daCasa, emAlerta, variacoesDasReceitas, visivelNaCasa, type VariacaoReceita } from "@/lib/dados"
import { AvisoAlertas } from "@/components/aviso-alertas"
import { BadgeVariacao } from "@/components/variacao"
import { SelecaoPdf } from "@/components/selecao-pdf"

export const metadata: Metadata = { title: "Preparos e bases" }

type Receita = {
  id: string; codigo: string; nome: string; dimensao_saida: Dimensao; ativo: boolean; estabelecimento_id: string | null
  versoes_receita: { numero: number; status: "rascunho" | "aprovada" | "arquivada" }[]
}

export default async function Subprodutos({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await exigirProducao()
  const custos = podeVerCustos(s)
  const { q = "" } = await searchParams
  const supabase = await createClient()
  let consulta = supabase
    .from("receitas")
    .select("id, codigo, nome, dimensao_saida, ativo, estabelecimento_id, versoes_receita(numero, status)")
    .eq("tipo", "subproduto")
    .order("nome")
  const termo = q.trim().replace(/[%,()]/g, " ")
  // sem busca, só os preparos da casa (compartilhados ou dela)
  consulta = consulta.or(termo ? `nome.ilike.%${termo}%,codigo.ilike.%${termo}%` : daCasa(s.casa.id))
  // Produção não busca custo nenhum
  const [{ data }, variacoes] = await Promise.all([
    consulta,
    custos ? variacoesDasReceitas(s.casa.id, "subproduto") : new Map<string, VariacaoReceita>(),
  ])
  const receitas = ((data ?? []) as Receita[]).filter((r) => visivelNaCasa(r.estabelecimento_id, s.casa.id))
  // custo de todos os preparos numa chamada só
  const custoPorReceita = custos ? await custosDasReceitas(s.casa.id, receitas.map((r) => r.id)) : new Map<string, number | null>()

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Preparos e bases</h1>
        </div>
        {custos ? (
          <Link href="/subprodutos/novo" className={buttonVariants({ className: "h-10 px-4" })}>Novo preparo</Link>
        ) : null}
      </div>

      <AvisoAlertas quantidade={[...variacoes.values()].filter(emAlerta).length} um="subproduto subiu" varios="subprodutos subiram" ancora="subprodutos" />

      <BuscaLista q={q} placeholder="Buscar subproduto por nome ou código" />

      {receitas.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">{q ? "Nenhum subproduto encontrado." : "Nenhum subproduto cadastrado."}</p>
      ) : (
        <SelecaoPdf acao="/subprodutos/pdf" total={receitas.filter((r) => r.versoes_receita.some((v) => v.status === "aprovada")).length}>
        <ul className="divide-y rounded-xl border">
          {receitas.map((r) => {
            const vigente = r.versoes_receita.find((v) => v.status === "aprovada")
            const rascunho = r.versoes_receita.some((v) => v.status === "rascunho")
            const destino = custos && !vigente ? `/subprodutos/${r.id}/rascunho` : `/subprodutos/${r.id}`
            return (
              <li key={r.id} className="flex items-stretch">
                <label className="flex w-12 shrink-0 cursor-pointer items-center justify-center hover:bg-muted/50" title={vigente ? "Marcar para o PDF" : "Sem versão aprovada"}>
                  <input type="checkbox" name="ids" value={r.id} disabled={!vigente} className="size-4 accent-foreground" aria-label={`Marcar ${r.nome} para o PDF`} />
                </label>
                <Link href={destino} className="grid min-w-0 flex-1 gap-1 py-3 pr-4 hover:bg-muted/50 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="font-medium">{r.nome}</div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{r.codigo} · {NOME_DIMENSAO[r.dimensao_saida]}</span>
                      {vigente ? <Badge variant="secondary">Versão {vigente.numero}</Badge> : <Badge variant="outline">Sem versão aprovada</Badge>}
                      {rascunho && custos ? <Badge variant="outline">Rascunho em edição</Badge> : null}
                    </div>
                  </div>
                  {custos ? (
                    <span className="inline-flex items-center gap-2 font-medium tabular-nums">
                      {custoPorReceita.get(r.id) != null
                        ? custoPorUnidade(custoPorReceita.get(r.id), r.dimensao_saida)
                        : <span className="text-sm font-normal text-muted-foreground">{vigente ? "Falta preço de insumo" : "—"}</span>}
                      {variacoes.get(r.id) ? <BadgeVariacao sinal={variacoes.get(r.id)!.sinal} pct={variacoes.get(r.id)!.variacao_pct} /> : null}
                    </span>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
        </SelecaoPdf>
      )}
    </div>
  )
}

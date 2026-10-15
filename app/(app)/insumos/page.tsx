import type { Metadata } from "next"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { categorias, nomesCategorias, variacoesDaCasa, type Insumo } from "@/lib/dados"
import { custoPorUnidade } from "@/lib/formato"
import { Variacao } from "@/components/variacao"
import { Entrada, Selecao } from "@/components/campos"
import { Button, buttonVariants } from "@/components/ui/button"

export const metadata: Metadata = { title: "Insumos" }

export default async function PaginaInsumos({
  searchParams,
}: { searchParams: Promise<{ q?: string; categoria?: string }> }) {
  const s = await exigirCustos()
  const { q = "", categoria = "" } = await searchParams
  const supabase = await createClient()

  const cats = await categorias("insumo")
  const nomes = nomesCategorias(cats)

  let consulta = supabase
    .from("insumos")
    .select("id, codigo, nome, dimensao, categoria_id, ativo")
    .order("nome")
  if (q.trim()) {
    const termo = q.trim().replace(/[%,()]/g, " ")
    consulta = consulta.or(`nome.ilike.%${termo}%,codigo.ilike.%${termo}%`)
  }
  if (categoria) {
    // Categoria-mãe inclui as subcategorias
    const ids = [categoria, ...cats.filter((c) => c.pai_id === categoria).map((c) => c.id)]
    consulta = consulta.in("categoria_id", ids)
  }
  const [{ data, error }, variacoes] = await Promise.all([consulta, variacoesDaCasa(s.casa.id)])
  const insumos = (data ?? []) as Pick<Insumo, "id" | "codigo" | "nome" | "dimensao" | "categoria_id" | "ativo">[]

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Insumos</h1>
          <p className="text-sm text-muted-foreground">Custo da última compra validada em {s.casa.nome}</p>
        </div>
        <Link href="/insumos/novo" className={buttonVariants({ className: "h-10 px-4" })}>Novo insumo</Link>
      </div>

      <form className="grid gap-2 sm:grid-cols-[1fr_16rem_auto]" role="search">
        <Entrada name="q" defaultValue={q} placeholder="Buscar por nome ou código" aria-label="Buscar" />
        <Selecao name="categoria" defaultValue={categoria} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{nomes.get(c.id)}</option>
          ))}
        </Selecao>
        <Button type="submit" variant="outline" className="h-10 px-4">Filtrar</Button>
      </form>

      {error ? <p className="text-sm text-destructive">Não foi possível carregar os insumos.</p> : null}
      {insumos.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">Nenhum insumo encontrado.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {insumos.map((i) => {
            const v = variacoes.get(i.id)
            return (
              <li key={i.id}>
                <Link href={`/insumos/${i.id}`} className="grid gap-1 px-4 py-3 hover:bg-muted/50 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {i.nome} {!i.ativo && <span className="text-xs font-normal text-muted-foreground">(inativo)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {i.codigo}{i.categoria_id ? ` · ${nomes.get(i.categoria_id)}` : ""}
                    </div>
                  </div>
                  <div className="grid gap-0.5 sm:justify-items-end">
                    <span className="font-medium tabular-nums">
                      {v ? custoPorUnidade(v.custo_atual, i.dimensao) : <span className="text-sm font-normal text-muted-foreground">Sem preço nesta casa</span>}
                    </span>
                    {v ? <Variacao sinal={v.sinal} pct={v.variacao_pct} data={v.data_referencia} casa={s.casa.nome} /> : null}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { exigirCasa, podeVerCustos } from "@/lib/sessao"
import { Abas } from "@/components/abas"
import { buttonVariants } from "@/components/ui/button"
import { MoreHorizontal } from "lucide-react"
import { ExcluirFicha, FichaExcluida } from "@/components/excluir-ficha"
import { excluirFicha, restaurarFicha } from "../actions"

export default async function LayoutFicha({
  children, params,
}: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const s = await exigirCasa()
  const { id } = await params
  const supabase = await createClient()
  const { data: r } = await supabase.from("receitas").select("codigo, nome, tipo, ativo").eq("id", id).maybeSingle()
  if (!r || r.tipo !== "final") notFound()

  const custos = podeVerCustos(s)
  // Gestão (custo, preço, CMV e composição) e Preparo (ingredientes e etapas, sem R$)
  const abas = custos
    ? [
        { href: `/fichas/${id}`, rotulo: "Gestão" },
        { href: `/fichas/${id}/preparo`, rotulo: "Preparo" },
        { href: `/fichas/${id}/preco`, rotulo: "Preço de venda" },
        { href: `/fichas/${id}/versoes`, rotulo: "Versões" },
      ]
    : [{ href: `/fichas/${id}`, rotulo: "Preparo" }]

  return (
    <div>
      <div className="mb-2 text-sm"><Link href="/fichas" className="text-muted-foreground hover:underline">← Fichas técnicas</Link></div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{r.nome}</h1>
          <p className="text-sm text-muted-foreground">{r.codigo}</p>
        </div>
        {custos ? (
          <div className="flex items-start gap-2">
            <Link href={`/fichas/${id}/editar`} className={buttonVariants({ className: "h-11 px-4" })}>Editar ficha</Link>
            {s.admin && r.ativo ? (
              <details className="relative">
                <summary className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-lg border hover:bg-muted" aria-label="Mais ações">
                  <MoreHorizontal className="size-5" aria-hidden />
                </summary>
                <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border bg-background p-2 shadow-lg">
                  <ExcluirFicha acao={excluirFicha.bind(null, id)} nome={r.nome} />
                </div>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
      {r.ativo ? null : <FichaExcluida acao={restaurarFicha.bind(null, id)} podeRestaurar={s.admin} />}
      <Abas itens={abas} />
      {children}
    </div>
  )
}

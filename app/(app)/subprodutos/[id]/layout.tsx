import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { exigirProducao, podeVerCustos } from "@/lib/sessao"
import { Abas } from "@/components/abas"
import { NOME_DIMENSAO, type Dimensao } from "@/lib/formato"
import { visivelNaCasa } from "@/lib/dados"
import { buttonVariants } from "@/components/ui/button"
import { FileDown } from "lucide-react"

export default async function LayoutSubproduto({
  children, params,
}: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const s = await exigirProducao()
  const { id } = await params
  const supabase = await createClient()
  const { data: r } = await supabase
    .from("receitas").select("codigo, nome, tipo, dimensao_saida, estabelecimento_id").eq("id", id).maybeSingle()
  if (!r || r.tipo !== "subproduto" || !visivelNaCasa(r.estabelecimento_id, s.casa.id)) notFound()

  const abas = podeVerCustos(s)
    ? [
        { href: `/subprodutos/${id}`, rotulo: "Ficha" },
        { href: `/subprodutos/${id}/rascunho`, rotulo: "Rascunho" },
        { href: `/subprodutos/${id}/versoes`, rotulo: "Versões" },
        { href: `/subprodutos/${id}/lotes`, rotulo: "Lotes" },
      ]
    : [
        { href: `/subprodutos/${id}`, rotulo: "Ficha de produção" },
        { href: `/subprodutos/${id}/lotes`, rotulo: "Lotes" },
      ]

  return (
    <div>
      <div className="mb-2 text-sm print:hidden"><Link href="/subprodutos" className="text-muted-foreground hover:underline">← Preparos e bases</Link></div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{r.nome}</h1>
          <p className="text-sm text-muted-foreground">{r.codigo} · {NOME_DIMENSAO[r.dimensao_saida as Dimensao]}</p>
        </div>
        <Link href={`/subprodutos/pdf?ids=${id}`} className={buttonVariants({ variant: "outline", className: "h-11 px-4" })}>
          <FileDown className="size-4" aria-hidden /> PDF
        </Link>
      </div>
      <Abas itens={abas} />
      {children}
    </div>
  )
}

import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { exigirCasa, podeVerCustos } from "@/lib/sessao"
import { Abas } from "@/components/abas"
import { NOME_DIMENSAO, type Dimensao } from "@/lib/formato"

export default async function LayoutSubproduto({
  children, params,
}: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const s = await exigirCasa()
  const { id } = await params
  const supabase = await createClient()
  const { data: r } = await supabase
    .from("receitas").select("codigo, nome, tipo, dimensao_saida").eq("id", id).maybeSingle()
  if (!r || r.tipo !== "subproduto") notFound()

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
      <div className="mb-2 text-sm"><Link href="/subprodutos" className="text-muted-foreground hover:underline">← Subprodutos</Link></div>
      <h1 className="text-xl font-semibold">{r.nome}</h1>
      <p className="mb-3 text-sm text-muted-foreground">{r.codigo} · {NOME_DIMENSAO[r.dimensao_saida as Dimensao]}</p>
      <Abas itens={abas} />
      {children}
    </div>
  )
}

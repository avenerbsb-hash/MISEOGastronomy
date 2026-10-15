import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { Abas } from "@/components/abas"
import { buttonVariants } from "@/components/ui/button"
import { NOME_DIMENSAO, type Dimensao } from "@/lib/formato"

export default async function LayoutInsumo({
  children, params,
}: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  await exigirCustos()
  const { id } = await params
  const supabase = await createClient()
  const { data: insumo } = await supabase
    .from("insumos").select("codigo, nome, dimensao, ativo, categorias(nome)").eq("id", id).maybeSingle()
  if (!insumo) notFound()
  const cat = (insumo.categorias as unknown as { nome: string } | null)?.nome

  return (
    <div>
      <div className="mb-2 text-sm"><Link href="/insumos" className="text-muted-foreground hover:underline">← Insumos</Link></div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{insumo.nome}</h1>
          <p className="text-sm text-muted-foreground">
            {insumo.codigo}{cat ? ` · ${cat}` : ""} · {NOME_DIMENSAO[insumo.dimensao as Dimensao]}
            {!insumo.ativo ? " · inativo" : ""}
          </p>
        </div>
        <Link href={`/insumos/${id}/editar`} className={buttonVariants({ variant: "outline", className: "h-9 px-3" })}>Editar</Link>
      </div>
      <Abas itens={[
        { href: `/insumos/${id}`, rotulo: "Resumo" },
        { href: `/insumos/${id}/historico`, rotulo: "Histórico" },
      ]} />
      {children}
    </div>
  )
}

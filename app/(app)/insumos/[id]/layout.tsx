import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { visivelNaCasa } from "@/lib/dados"
import { exigirCustos } from "@/lib/sessao"
import { Abas } from "@/components/abas"
import { VoltarLista } from "@/components/voltar-lista"
import { buttonVariants } from "@/components/ui/button"
import { NOME_DIMENSAO, type Dimensao } from "@/lib/formato"

export default async function LayoutInsumo({
  children, params,
}: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const s = await exigirCustos()
  const { id } = await params
  const supabase = await createClient()
  const { data: insumo } = await supabase
    .from("insumos").select("codigo, nome, dimensao, ativo, estabelecimento_id, categorias(nome)").eq("id", id).maybeSingle()
  if (!insumo || !visivelNaCasa(insumo.estabelecimento_id, s.casa.id)) notFound()
  const cat = (insumo.categorias as unknown as { nome: string } | null)?.nome

  return (
    <div>
      <div className="mb-2 text-sm"><VoltarLista base="/insumos" rotulo="← Insumos" /></div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{insumo.nome}</h1>
          <p className="text-sm text-muted-foreground">
            {insumo.codigo}{cat ? ` · ${cat}` : ""} · {NOME_DIMENSAO[insumo.dimensao as Dimensao]}
            {!insumo.ativo ? " · inativo" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <a href="#registrar-compra" className={buttonVariants({ className: "h-11 px-4" })}>Registrar compra</a>
          <Link href={`/insumos/${id}/editar`} className={buttonVariants({ variant: "outline", className: "h-11 px-4" })}>Editar</Link>
        </div>
      </div>
      <Abas itens={[
        { href: `/insumos/${id}`, rotulo: "Resumo" },
        { href: `/insumos/${id}/historico`, rotulo: "Histórico" },
      ]} />
      {children}
    </div>
  )
}

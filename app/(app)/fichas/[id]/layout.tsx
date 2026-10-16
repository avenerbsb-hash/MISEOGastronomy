import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { exigirCasa, podeVerCustos } from "@/lib/sessao"
import { Abas } from "@/components/abas"
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

  const abas = podeVerCustos(s)
    ? [
        { href: `/fichas/${id}`, rotulo: "Ficha" },
        { href: `/fichas/${id}/editar`, rotulo: "Editar ficha" },
        { href: `/fichas/${id}/preco`, rotulo: "Preço de venda" },
        { href: `/fichas/${id}/versoes`, rotulo: "Versões" },
      ]
    : [{ href: `/fichas/${id}`, rotulo: "Ficha de produção" }]

  return (
    <div>
      <div className="mb-2 text-sm"><Link href="/fichas" className="text-muted-foreground hover:underline">← Fichas</Link></div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{r.nome}</h1>
          <p className="text-sm text-muted-foreground">{r.codigo}</p>
        </div>
        {s.admin && r.ativo ? <ExcluirFicha acao={excluirFicha.bind(null, id)} nome={r.nome} /> : null}
      </div>
      {r.ativo ? null : <FichaExcluida acao={restaurarFicha.bind(null, id)} podeRestaurar={s.admin} />}
      <Abas itens={abas} />
      {children}
    </div>
  )
}

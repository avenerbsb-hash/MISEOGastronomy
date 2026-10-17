import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { exigirProducao } from "@/lib/sessao"
import { FichaProducao, type LinhaProducao } from "@/components/ficha-producao"

// Preparo: ingredientes, quantidades, etapas, rendimento e apresentação (sem valores em R$)
export default async function PreparoFicha({ params }: { params: Promise<{ id: string }> }) {
  await exigirProducao()
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from("vw_ficha_producao").select("*").eq("receita_id", id).order("ordem")
  const linhas = (data ?? []) as LinhaProducao[]
  if (!linhas.length) {
    return <p className="text-sm text-muted-foreground">Esta ficha ainda não tem versão aprovada. <Link href={`/fichas/${id}/editar`} className="underline">Abrir o rascunho</Link>.</p>
  }
  return <FichaProducao linhas={linhas} />
}

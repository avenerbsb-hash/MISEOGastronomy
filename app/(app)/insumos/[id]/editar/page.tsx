import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { categorias, nomesCategorias, type Insumo } from "@/lib/dados"
import { salvarInsumo } from "../../actions"
import { FormInsumo } from "../../form-insumo"

export const metadata: Metadata = { title: "Editar insumo" }

export default async function EditarInsumo({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirCustos()
  const { id } = await params
  const supabase = await createClient()
  const [{ data }, cats, precos, fichas] = await Promise.all([
    supabase.from("insumos")
      .select("id, codigo, nome, dimensao, categoria_id, apresentacao, alergenos, ativo, densidade_g_ml, densidade_validada_em")
      .eq("id", id).maybeSingle(),
    categorias("insumo"),
    supabase.from("historico_precos").select("id", { count: "exact", head: true }).eq("insumo_id", id),
    supabase.from("componentes_receita").select("id", { count: "exact", head: true }).eq("insumo_id", id),
  ])
  if (!data) notFound()
  // Preços de outras casas não aparecem por RLS; o banco barra a troca de medida de qualquer forma
  const emUso = (precos.count ?? 0) > 0 || (fichas.count ?? 0) > 0
  return (
    <FormInsumo
      acao={salvarInsumo.bind(null, id)}
      insumo={data as Insumo}
      cats={cats}
      nomes={nomesCategorias(cats)}
      admin={s.admin}
      emUso={emUso}
    />
  )
}

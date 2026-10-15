import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { categorias, nomesCategorias, type Insumo } from "@/lib/dados"
import { FormAcao, BotaoEnviar } from "@/components/form-acao"
import { excluirInsumo, salvarInsumo } from "../../actions"
import { FormInsumo } from "../../form-insumo"

export const metadata: Metadata = { title: "Editar insumo" }

export default async function EditarInsumo({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirCustos()
  const { id } = await params
  const supabase = await createClient()
  const contar = (tabela: string) =>
    supabase.from(tabela).select("id", { count: "exact", head: true }).eq("insumo_id", id)
  const [{ data }, cats, precos, fichas, notas] = await Promise.all([
    supabase.from("insumos")
      .select("id, codigo, nome, dimensao, categoria_id, apresentacao, alergenos, ativo, densidade_g_ml, densidade_validada_em")
      .eq("id", id).maybeSingle(),
    categorias("insumo"),
    contar("historico_precos"),
    contar("componentes_receita"),
    contar("itens_importacao"),
  ])
  if (!data) notFound()
  // Preços de outras casas não aparecem por RLS; o banco barra a troca de medida e a exclusão de qualquer forma
  const emUso = (precos.count ?? 0) + (fichas.count ?? 0) + (notas.count ?? 0) > 0
  return (
    <div className="grid max-w-xl gap-6">
      <FormInsumo
        acao={salvarInsumo.bind(null, id)}
        insumo={data as Insumo}
        cats={cats}
        nomes={nomesCategorias(cats)}
        admin={s.admin}
        emUso={emUso}
      />

      <section className="grid gap-2 rounded-xl border border-destructive/30 p-4">
        <h2 className="text-sm font-semibold">Excluir insumo</h2>
        {emUso ? (
          <p className="text-sm text-muted-foreground">
            Este insumo já tem preços, notas ou fichas, então não pode ser excluído (o histórico fica preservado).
            Para tirá-lo das listas de escolha, desmarque <b>Ativo</b> acima e salve.
          </p>
        ) : (
          <FormAcao acao={excluirInsumo.bind(null, id)} limparAoSalvar={false}>
            <p className="text-sm text-muted-foreground">Ainda não foi usado em nenhum preço, nota ou ficha. A exclusão não pode ser desfeita.</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="confirmar" className="size-4" required />
              Sim, quero excluir “{data.nome}”
            </label>
            <div><BotaoEnviar variant="destructive" enviando="Excluindo…">Excluir insumo</BotaoEnviar></div>
          </FormAcao>
        )}
      </section>
    </div>
  )
}

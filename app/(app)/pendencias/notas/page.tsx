import type { Metadata } from "next"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { categorias, nomesCategorias } from "@/lib/dados"
import type { Dimensao } from "@/lib/formato"
import { ImportarNotas } from "./importar-notas"

export const metadata: Metadata = { title: "Importar notas" }

export default async function PaginaImportarNotas() {
  const s = await exigirCustos()
  const supabase = await createClient()
  const [{ data: insumos }, cats] = await Promise.all([
    supabase.from("insumos").select("id, nome, dimensao").eq("ativo", true).order("nome"),
    categorias("insumo"),
  ])
  const nomes = nomesCategorias(cats)
  return (
    <div className="grid gap-4">
      <div>
        <div className="mb-2 text-sm"><Link href="/pendencias" className="text-muted-foreground hover:underline">← Pendências</Link></div>
        <h1 className="text-xl font-semibold">Importar notas fiscais (XML)</h1>
        <p className="text-sm text-muted-foreground">
          O sistema lê fornecedor, data e itens. Itens já conhecidos entram sozinhos; os novos você define uma vez e o
          sistema aprende para as próximas notas.
        </p>
      </div>
      <ImportarNotas
        casa={s.casa.nome}
        insumos={(insumos ?? []).map((i) => ({ id: i.id as string, nome: i.nome as string, dimensao: i.dimensao as Dimensao }))}
        categorias={cats.map((c) => ({ id: c.id, nome: nomes.get(c.id) ?? c.nome }))}
      />
    </div>
  )
}

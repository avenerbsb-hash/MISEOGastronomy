import type { Metadata } from "next"
import { exigirCustos } from "@/lib/sessao"
import { categorias, nomesCategorias } from "@/lib/dados"
import { salvarInsumo } from "../actions"
import { FormInsumo } from "../form-insumo"

export const metadata: Metadata = { title: "Novo insumo" }

export default async function NovoInsumo() {
  const s = await exigirCustos()
  const cats = await categorias("insumo")
  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">Novo insumo</h1>
      <FormInsumo acao={salvarInsumo.bind(null, null)} cats={cats} nomes={nomesCategorias(cats)} admin={s.admin} />
    </div>
  )
}

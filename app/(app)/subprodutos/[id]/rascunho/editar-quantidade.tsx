"use client"

import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"
import type { Acao } from "@/components/form-acao"
import { rotuloUnidade } from "@/lib/formato"
import { cn } from "@/lib/utils"

// Unidades da mesma medida da unidade atual (trocar g por mL depende de densidade: remover e adicionar)
const FAMILIAS = [["mg", "g", "kg"], ["ml", "l"], ["un"]]

// Quantidade editável direto na lista de componentes do rascunho
export function EditarQuantidade({ acao, quantidade, unidade }: { acao: Acao; quantidade: number; unidade: string }) {
  const [estado, enviar] = useActionState(acao, null)
  const inicial = String(quantidade).replace(".", ",")
  const [valor, setValor] = useState(inicial)
  const [un, setUn] = useState(unidade)
  const mudou = Number(valor.replace(",", ".")) !== Number(quantidade) || un !== unidade
  const opcoes = FAMILIAS.find((f) => f.includes(unidade)) ?? [unidade]
  return (
    <form action={enviar} className="mt-1 flex flex-wrap items-center gap-1.5">
      <input name="quantidade" value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" required
        aria-label="Quantidade"
        className="h-8 w-20 rounded-md border bg-background px-2 text-right text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-ring" />
      <select name="unidade" value={un} onChange={(e) => setUn(e.target.value)} aria-label="Unidade"
        className="h-8 rounded-md border bg-background px-1.5 text-sm">
        {opcoes.map((u) => <option key={u} value={u}>{rotuloUnidade(u)}</option>)}
      </select>
      {mudou ? <Salvar /> : null}
      {estado?.erro ? <span role="alert" className="w-full text-xs text-destructive">{estado.erro}</span> : null}
      {estado?.ok && !mudou ? <span role="status" className="text-xs text-emerald-700 dark:text-emerald-400">✓ {estado.ok}</span> : null}
    </form>
  )
}

function Salvar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className={cn("h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background", pending && "opacity-60")}>
      {pending ? "Salvando…" : "Salvar"}
    </button>
  )
}

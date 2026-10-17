"use client"

import { useActionState, useState } from "react"
import { Button } from "@/components/ui/button"
import { BotaoEnviar, type Estado } from "@/components/form-acao"

// Excluir ficha técnica com confirmação (a ficha sai de uso; histórico e versões ficam guardados)
export function ExcluirFicha({ acao, nome }: { acao: (estado: Estado) => Promise<Estado>; nome: string }) {
  const [confirmar, setConfirmar] = useState(false)
  const [estado, enviar] = useActionState(acao, null)
  if (!confirmar) {
    return (
      <Button type="button" variant="outline" className="h-9 px-3 text-sm text-destructive hover:text-destructive" onClick={() => setConfirmar(true)}>
        Excluir ficha
      </Button>
    )
  }
  return (
    <form action={enviar} className="grid max-w-md gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p>
        Excluir <b>{nome}</b>? Ela sai da lista de fichas e do cardápio de todas as casas.
        O histórico de custos, preços e versões fica guardado, e dá para restaurar depois.
      </p>
      <div className="flex flex-wrap gap-2">
        <BotaoEnviar variant="destructive" className="h-9 px-3" enviando="Excluindo…">Sim, excluir</BotaoEnviar>
        <Button type="button" variant="outline" className="h-9 px-3" onClick={() => setConfirmar(false)}>Cancelar</Button>
      </div>
      {estado?.erro && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">{estado.erro}</p>}
    </form>
  )
}

// Aviso no topo de uma ficha excluída, com o botão Restaurar
export function FichaExcluida({ acao, podeRestaurar }: { acao: (estado: Estado) => Promise<Estado>; podeRestaurar: boolean }) {
  const [estado, enviar] = useActionState(acao, null)
  return (
    <form action={enviar} className="mb-3 grid gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span><b>Ficha excluída.</b> Não aparece na lista de fichas nem nos cardápios; o histórico continua guardado.</span>
        {podeRestaurar && !estado?.ok ? <BotaoEnviar variant="outline" className="h-8 px-3 text-sm" enviando="Restaurando…">Restaurar ficha</BotaoEnviar> : null}
      </div>
      {estado?.erro && <p role="alert" className="text-destructive">{estado.erro}</p>}
      {estado?.ok && <p role="status" className="text-queda">{estado.ok}</p>}
    </form>
  )
}

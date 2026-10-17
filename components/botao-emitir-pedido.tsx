"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"

// Emitir PDF do pedido: marca o pedido da última contagem como emitido e abre a impressão ("Salvar como PDF")
export function BotaoEmitirPedido({ contagemId, acao }: { contagemId: string | null; acao: (contagemId: string) => Promise<void> }) {
  const [enviando, iniciar] = useTransition()
  return (
    <Button type="button" className="h-11 px-4" disabled={enviando}
      onClick={() => iniciar(async () => {
        if (contagemId) { try { await acao(contagemId) } catch { /* sem a migração 0027: só imprime */ } }
        window.print()
      })}>
      {enviando ? "Preparando…" : "Emitir PDF"}
    </Button>
  )
}

"use client"

import { Button } from "@/components/ui/button"

// Abre a janela de impressão do navegador ("Salvar como PDF" está nela)
export function BotaoImprimir({ children = "Salvar como PDF" }: { children?: React.ReactNode }) {
  return (
    <Button type="button" className="h-10 px-4" onClick={() => window.print()}>
      {children}
    </Button>
  )
}

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

// Copia o pedido em texto (para colar no WhatsApp ou no e-mail do fornecedor)
export function CopiarPedido({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <Button type="button" className="h-11 px-4" onClick={async () => {
      try {
        await navigator.clipboard.writeText(texto)
        setCopiado(true)
        setTimeout(() => setCopiado(false), 2500)
      } catch {
        setCopiado(false)
      }
    }}>
      {copiado ? "Pedido copiado" : "Copiar pedido"}
    </Button>
  )
}

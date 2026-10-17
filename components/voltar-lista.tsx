"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"

// Volta para a lista com a mesma busca e os mesmos filtros (vêm na URL do detalhe)
export function VoltarLista({ base, rotulo }: { base: string; rotulo: string }) {
  const p = useSearchParams()
  const qs = p.toString()
  return <Link href={qs ? `${base}?${qs}` : base} className="inline-flex min-h-11 items-center text-muted-foreground hover:underline">{rotulo}</Link>
}

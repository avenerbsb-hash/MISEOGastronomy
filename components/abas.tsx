"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

// Abas como links (cada aba é uma rota)
export function Abas({ itens }: { itens: { href: string; rotulo: string }[] }) {
  const atual = usePathname()
  return (
    <nav className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b px-4 print:hidden" aria-label="Seções">
      {itens.map((i) => {
        const ativo = atual === i.href
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm",
              ativo ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {i.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}

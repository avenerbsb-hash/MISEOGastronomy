"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export function Menu({ itens }: { itens: { href: string; rotulo: string }[] }) {
  const atual = usePathname()
  return (
    <nav aria-label="Menu principal" className="flex gap-1 overflow-x-auto">
      {itens.map((i) => {
        const ativo = atual === i.href || atual.startsWith(i.href + "/")
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-2 text-sm",
              ativo ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {i.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}

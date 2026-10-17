"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Bell, BookOpen, Boxes, ChefHat, ClipboardList, Store, Users, ChevronsLeft, ChevronsRight, House, Menu as IconeMenu, Package, PieChart, ShoppingCart, X,
} from "lucide-react"
import { cn } from "@/lib/utils"

export type ItemMenu = { href: string; rotulo: string; contador?: number }

const ICONES: Record<string, typeof House> = {
  "/inicio": House, "/cmv": PieChart, "/fichas": BookOpen, "/subprodutos": ChefHat,
  "/insumos": Package, "/pendencias": ShoppingCart, "/estoque": Boxes, "/estoque/contagem": ClipboardList, "/alertas": Bell, "/casa": Store, "/usuarios": Users,
}
const CHAVE = "miseo_menu_recolhido"

function Itens({ itens, recolhido, aoEscolher }: { itens: ItemMenu[]; recolhido: boolean; aoEscolher?: () => void }) {
  const atual = usePathname()
  return (
    <nav aria-label="Menu principal" className="grid gap-1">
      {itens.map((i) => {
        const ativo = atual === i.href || atual.startsWith(i.href + "/")
        const Icone = ICONES[i.href] ?? House
        return (
          <Link key={i.href} href={i.href} onClick={aoEscolher} aria-current={ativo ? "page" : undefined}
            title={recolhido ? i.rotulo : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              recolhido && "justify-center px-0",
              ativo ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}>
            <Icone className="size-5 shrink-0" aria-hidden />
            {recolhido ? <span className="sr-only">{i.rotulo}</span> : <span className="truncate">{i.rotulo}</span>}
            {i.contador ? (
              <span className={cn("rounded-full bg-alta px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white", recolhido ? "absolute ml-6 -mt-6" : "ml-auto")}
                title={`${i.contador} para conferir`}>{i.contador}</span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}

// Computador: menu lateral recolhível (lembra a escolha neste navegador)
export function MenuLateral({ itens }: { itens: ItemMenu[] }) {
  const [recolhido, setRecolhido] = useState(false)
  useEffect(() => { try { setRecolhido(localStorage.getItem(CHAVE) === "1") } catch {} }, [])
  const alternar = () => {
    setRecolhido((r) => { try { localStorage.setItem(CHAVE, r ? "0" : "1") } catch {} return !r })
  }
  return (
    <aside className={cn("sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col justify-between border-r px-2 py-3 md:flex print:hidden",
      recolhido ? "w-16" : "w-56")}>
      <Itens itens={itens} recolhido={recolhido} />
      <button type="button" onClick={alternar} aria-label={recolhido ? "Abrir menu" : "Recolher menu"}
        className="flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
        {recolhido ? <ChevronsRight className="size-5" /> : <><ChevronsLeft className="size-5" /> Recolher menu</>}
      </button>
    </aside>
  )
}

// Celular: botão "Menu" no cabeçalho abre a gaveta por cima do conteúdo
export function MenuCelular({ itens }: { itens: ItemMenu[] }) {
  const [aberto, setAberto] = useState(false)
  const atual = usePathname()
  useEffect(() => { setAberto(false) }, [atual])
  useEffect(() => {
    if (!aberto) return
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false) }
    document.addEventListener("keydown", tecla)
    document.body.style.overflow = "hidden"
    return () => { document.removeEventListener("keydown", tecla); document.body.style.overflow = "" }
  }, [aberto])
  const pendentes = itens.reduce((a, i) => a + (i.contador ?? 0), 0)
  return (
    <div className="md:hidden">
      <button type="button" onClick={() => setAberto(true)} aria-expanded={aberto} aria-controls="menu-celular"
        className="relative flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium hover:bg-muted">
        <IconeMenu className="size-5" aria-hidden /> Menu
        {pendentes ? <span className="absolute right-0.5 top-1 size-2.5 rounded-full bg-alta" aria-label={`${pendentes} pendências`} /> : null}
      </button>
      {aberto ? createPortal(
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" onClick={() => setAberto(false)} className="absolute inset-0 bg-black/40" />
          <div id="menu-celular" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-3 bg-background p-3 shadow-xl"
            style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
            <div className="flex items-center justify-between">
              <span className="px-2 font-semibold tracking-wide">MISEO</span>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar menu"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-muted"><X className="size-5" /></button>
            </div>
            <Itens itens={itens} recolhido={false} aoEscolher={() => setAberto(false)} />
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}

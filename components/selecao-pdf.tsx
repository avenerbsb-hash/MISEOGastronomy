"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"

// Lista com caixas de seleção (name="ids") e barra fixa para emitir o PDF dos marcados (GET para "acao")
export function SelecaoPdf({ acao, total, children }: { acao: string; total: number; children: React.ReactNode }) {
  const ref = useRef<HTMLFormElement>(null)
  const [marcados, setMarcados] = useState(0)
  const caixas = () => [...(ref.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]') ?? [])]
  const contar = () => setMarcados(caixas().filter((c) => c.checked).length)
  const todos = (v: boolean) => { caixas().forEach((c) => { c.checked = v }); contar() }
  return (
    <form ref={ref} action={acao} method="get" target="_blank" onChange={contar} className="grid gap-3 pb-20">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" onClick={() => todos(true)} className="underline hover:text-foreground">Marcar todos ({total})</button>
        {marcados ? <button type="button" onClick={() => todos(false)} className="text-muted-foreground underline hover:text-foreground">Limpar seleção</button> : null}
        <span className="text-muted-foreground">Marque um ou vários preparos para emitir as fichas em PDF.</span>
      </div>
      {children}
      {marcados ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-3 shadow-lg backdrop-blur md:left-auto md:right-6 md:bottom-6 md:rounded-xl md:border">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm"><b className="tabular-nums">{marcados}</b> {marcados === 1 ? "preparo marcado" : "preparos marcados"}</span>
            <Button type="submit" className="h-11 px-4">Emitir PDF{marcados > 1 ? ` (${marcados})` : ""}</Button>
          </div>
        </div>
      ) : null}
    </form>
  )
}

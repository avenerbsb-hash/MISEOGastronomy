"use client"

import { useActionState, useEffect, useRef } from "react"
import { useFormStatus } from "react-dom"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type Estado = { erro?: string; ok?: string } | null
export type Acao = (estado: Estado, dados: FormData) => Promise<Estado>

// Formulário ligado a uma Server Action: mostra erro (em português) ou sucesso
export function FormAcao({
  acao, children, className, limparAoSalvar = true,
}: { acao: Acao; children: React.ReactNode; className?: string; limparAoSalvar?: boolean }) {
  const [estado, enviar] = useActionState(acao, null)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (estado?.ok && limparAoSalvar) ref.current?.reset()
  }, [estado, limparAoSalvar])
  return (
    <form ref={ref} action={enviar} className={cn("grid gap-3", className)}>
      {children}
      {estado?.erro && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{estado.erro}</p>
      )}
      {estado?.ok && (
        <p role="status" className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{estado.ok}</p>
      )}
    </form>
  )
}

export function BotaoEnviar({
  children, variant, className, name, value,
}: {
  children: React.ReactNode
  variant?: "default" | "outline" | "secondary" | "destructive" | "ghost"
  className?: string
  name?: string
  value?: string
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variant} disabled={pending} className={cn("h-10 px-4", className)} name={name} value={value}>
      {pending ? "Salvando…" : children}
    </Button>
  )
}

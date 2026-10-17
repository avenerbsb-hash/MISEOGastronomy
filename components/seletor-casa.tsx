"use client"

import { useTransition } from "react"
import { trocarCasa } from "@/app/(app)/actions"
import { classeCampo } from "@/components/campos"
import { cn } from "@/lib/utils"

const NOME_PAPEL = { admin: "Admin", gestor: "Gestor", producao: "Produção", estoquista: "Estoquista", contagem: "Contagem" } as const

export function SeletorCasa({
  casas, atual,
}: { casas: { id: string; nome: string; papel: keyof typeof NOME_PAPEL }[]; atual: string }) {
  const [pendente, iniciar] = useTransition()
  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="sr-only">Casa</span>
      <select
        aria-label="Casa"
        className={cn(classeCampo, "h-11 min-w-0 max-w-[60vw] font-medium sm:max-w-xs", pendente && "opacity-60")}
        defaultValue={atual}
        onChange={(e) => {
          const fd = new FormData()
          fd.set("casa", e.target.value)
          iniciar(() => trocarCasa(fd))
        }}
      >
        {casas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome} · {NOME_PAPEL[c.papel]}
          </option>
        ))}
      </select>
    </label>
  )
}

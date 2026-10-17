"use client"

import { useState } from "react"
import { FormAcao, BotaoEnviar, type Acao } from "@/components/form-acao"

// Escolher a imagem, ver a prévia e enviar a logo da casa
export function EnviarLogo({ acao }: { acao: Acao }) {
  const [previa, setPrevia] = useState<string | null>(null)
  return (
    <FormAcao acao={acao} className="gap-3">
      <label className="grid gap-2 text-sm">
        <span className="font-medium">Nova logo</span>
        <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" required
          className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border file:bg-background file:px-4 file:text-sm file:font-medium hover:file:bg-muted"
          onChange={(e) => {
            const f = e.target.files?.[0]
            setPrevia((antiga) => { if (antiga) URL.revokeObjectURL(antiga); return f ? URL.createObjectURL(f) : null })
          }} />
        <span className="text-xs text-muted-foreground">PNG, JPG ou WEBP, até 2 MB. De preferência com fundo transparente ou na cor da marca.</span>
      </label>
      {previa ? (
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Prévia</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previa} alt="Prévia da logo" className="h-20 w-auto max-w-full rounded-md border object-contain p-1" />
        </div>
      ) : null}
      <div><BotaoEnviar className="h-11 px-5" enviando="Enviando…">Salvar logo</BotaoEnviar></div>
    </FormAcao>
  )
}

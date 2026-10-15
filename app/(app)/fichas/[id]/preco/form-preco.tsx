"use client"

import { useState } from "react"
import { FormAcao, BotaoEnviar, type Acao } from "@/components/form-acao"
import { Campo, Entrada } from "@/components/campos"
import { reais } from "@/lib/formato"

export type Sugestao = { rotulo: string; detalhe: string; valor: number }

// Formulário de novo preço; as sugestões (calculadas no banco) só preenchem o campo
export function FormPreco({ acao, atual, sugestoes }: { acao: Acao; atual: number | null; sugestoes: Sugestao[] }) {
  const [preco, setPreco] = useState(atual != null ? String(atual).replace(".", ",") : "")
  return (
    <FormAcao acao={acao} limparAoSalvar={false}>
      {sugestoes.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {sugestoes.map((s) => (
            <button
              key={s.rotulo} type="button"
              onClick={() => setPreco(String(s.valor).replace(".", ","))}
              className="rounded-lg border p-3 text-left hover:bg-muted"
            >
              <div className="text-sm font-medium">{s.rotulo}: {reais(s.valor)}</div>
              <div className="text-xs text-muted-foreground">{s.detalhe}</div>
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <Campo rotulo="Novo preço de venda (R$)">
          <Entrada name="preco" inputMode="decimal" required value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="45,00" />
        </Campo>
        <Campo rotulo="Motivo">
          <Entrada name="motivo" maxLength={200} placeholder="ex.: reajuste do cardápio de outubro" />
        </Campo>
      </div>
      <div><BotaoEnviar>Aprovar preço</BotaoEnviar></div>
    </FormAcao>
  )
}

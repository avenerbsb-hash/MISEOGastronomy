"use client"

import { useState } from "react"
import { FormAcao, BotaoEnviar, type Acao } from "@/components/form-acao"
import { Entrada, Selecao } from "@/components/campos"

// Estorno de compra validada (0016): motivo obrigatório; quantidade/valor certos opcionais.
export function EstornarCompra({ acao, unidades, quantidade, unidade }: {
  acao: Acao; unidades: { codigo: string; nome: string }[]; quantidade: number; unidade: string
}) {
  const [aberto, setAberto] = useState(false)
  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="mt-1 text-xs text-muted-foreground underline hover:text-foreground">
        Estornar
      </button>
    )
  }
  return (
    <FormAcao acao={acao} limparAoSalvar={false} className="mt-2 w-72 gap-2 rounded-lg border bg-background p-3 text-xs no-underline">
      <p className="text-muted-foreground">
        A compra fica guardada como <b>rejeitada</b> e sai do custo. Se souber os números certos, preencha para lançar a correção.
      </p>
      <Entrada name="motivo" required minLength={3} maxLength={300} placeholder="Motivo (ex.: nota cobrou 0,1 pacote = 1 fava)" aria-label="Motivo do estorno" className="h-8 text-xs" />
      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <Entrada name="quantidade" inputMode="decimal" placeholder={`Quantidade certa (era ${String(quantidade).replace(".", ",")})`} aria-label="Quantidade certa" className="h-8 text-xs" />
        <Selecao name="unidade" defaultValue={unidades.some((u) => u.codigo === unidade) ? unidade : unidades[0]?.codigo} aria-label="Unidade" className="h-8 text-xs">
          {unidades.map((u) => <option key={u.codigo} value={u.codigo}>{u.nome}</option>)}
        </Selecao>
      </div>
      <Entrada name="valor" inputMode="decimal" placeholder="Valor total certo (R$)" aria-label="Valor total certo" className="h-8 text-xs" />
      <label className="flex items-center gap-2">
        <input type="checkbox" name="todas" value="sim" defaultChecked /> Estornar também nas outras casas (mesma nota)
      </label>
      <div className="flex gap-2">
        <BotaoEnviar variant="destructive" className="h-8 px-3 text-xs" enviando="Estornando…">Estornar compra</BotaoEnviar>
        <button type="button" onClick={() => setAberto(false)} className="h-8 rounded-md border px-3">Cancelar</button>
      </div>
    </FormAcao>
  )
}

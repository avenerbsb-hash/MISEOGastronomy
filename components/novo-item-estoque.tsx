"use client"

import { useState } from "react"
import { BuscaInsumo } from "@/components/busca-insumo"
import { FormAcao, BotaoEnviar, type Acao } from "@/components/form-acao"
import { Campo, Entrada } from "@/components/campos"

// Incluir um insumo no controle de estoque da casa
export function NovoItemEstoque({ acao, insumos }: { acao: Acao; insumos: { id: string; nome: string }[] }) {
  const [insumoId, setInsumoId] = useState("")
  return (
    <FormAcao acao={acao} className="gap-3">
      <input type="hidden" name="insumo_id" value={insumoId} />
      <Campo rotulo="Insumo">
        <BuscaInsumo insumos={insumos} valor={insumoId} aoEscolher={setInsumoId} placeholder="Digite para procurar (ex.: Smirnoff)…" />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Unidade de compra">
          <Entrada name="unidade_compra" defaultValue="garrafa" maxLength={30} required className="h-11" />
        </Campo>
        <Campo rotulo="Estoque mínimo">
          <Entrada name="estoque_minimo" inputMode="decimal" required placeholder="ex.: 6" className="h-11" />
        </Campo>
        <Campo rotulo="Conteúdo (g, mL ou un) — opcional">
          <Entrada name="conteudo" inputMode="decimal" placeholder="ex.: 750" className="h-11" />
        </Campo>
      </div>
      <div><BotaoEnviar className="h-11 px-5">Incluir no estoque</BotaoEnviar></div>
    </FormAcao>
  )
}

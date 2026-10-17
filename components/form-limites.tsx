"use client"

import { FormAcao, BotaoEnviar, type Acao } from "@/components/form-acao"
import { Input } from "@/components/ui/input"

export type LimiteGrupo = {
  grupo: string; atencao_pct: number; alerta_pct: number; critico_pct: number
  cmv_atencao_pp: number; cmv_critico_pp: number; padrao: boolean
}

const CAMPOS = [
  { nome: "atencao", chave: "atencao_pct", rotulo: "Atenção", sufixo: "%" },
  { nome: "alerta", chave: "alerta_pct", rotulo: "Alerta", sufixo: "%" },
  { nome: "critico", chave: "critico_pct", rotulo: "Crítico", sufixo: "%" },
  { nome: "cmv_atencao", chave: "cmv_atencao_pp", rotulo: "CMV atenção", sufixo: "p.p." },
  { nome: "cmv_critico", chave: "cmv_critico_pp", rotulo: "CMV crítico", sufixo: "p.p." },
] as const

// Limites de alerta de um grupo de fichas (gestor): alta do custo em % e subida do CMV em pontos
export function FormLimites({ limite, nome, acao }: { limite: LimiteGrupo; nome: string; acao: Acao }) {
  return (
    <FormAcao acao={acao} limparAoSalvar={false} className="gap-2 rounded-lg border p-3">
      <input type="hidden" name="grupo" value={limite.grupo} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{nome}</h3>
        <span className="text-xs text-muted-foreground">{limite.padrao ? "padrão do sistema" : "ajustado para esta casa"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {CAMPOS.map((c) => (
          <label key={c.nome} className="grid gap-1 text-xs text-muted-foreground">
            {c.rotulo} ({c.sufixo})
            <Input name={c.nome} type="number" inputMode="decimal" step="0.1" min="0.1" required defaultValue={String(limite[c.chave])} className="h-10 tabular-nums" />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <BotaoEnviar className="h-10" name="acao" value="salvar">Salvar</BotaoEnviar>
        {!limite.padrao ? <BotaoEnviar variant="ghost" className="h-10 text-muted-foreground" name="acao" value="padrao" enviando="Voltando…">Voltar ao padrão</BotaoEnviar> : null}
      </div>
    </FormAcao>
  )
}

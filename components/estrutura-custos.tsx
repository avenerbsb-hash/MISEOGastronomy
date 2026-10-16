import { FormAcao, BotaoEnviar, type Acao } from "@/components/form-acao"
import { Entrada } from "@/components/campos"
import { percentual } from "@/lib/formato"

// Estrutura de custos & taxas da casa (% sobre o preço de venda). Totais vêm de estrutura_custos (0013).
export type Estrutura = {
  impostos_pct: number; cartao_pct: number; gorjeta_pct: number; ifood_pct: number; comissoes_pct: number; outras_pct: number
  despesas_fixas_pct: number; despesa_financeira_pct: number; investimento_lucro_pct: number
  variaveis_pct: number; estrutura_pct: number; total_pct: number; personalizada: boolean
}

const VARIAVEIS: [keyof Estrutura, string][] = [
  ["impostos_pct", "Impostos"], ["cartao_pct", "Taxa de cartão"], ["gorjeta_pct", "Gorjeta / serviço"],
  ["ifood_pct", "Taxa iFood"], ["comissoes_pct", "Comissões / taxas"], ["outras_pct", "Outras taxas"],
]
const ESTRUTURA: [keyof Estrutura, string][] = [
  ["despesas_fixas_pct", "Despesas fixas (rateio)"], ["despesa_financeira_pct", "Despesa financeira"], ["investimento_lucro_pct", "Investimento / dist. lucro"],
]

export function EstruturaCustos({ e, salvar, restaurar }: { e: Estrutura; salvar: Acao; restaurar: Acao }) {
  const campo = ([k, rotulo]: [keyof Estrutura, string]) => (
    <label key={k} className="flex items-center justify-between gap-3 text-sm">
      <span>{rotulo}</span>
      <span className="flex items-center gap-1.5">
        <Entrada name={k} inputMode="decimal" defaultValue={String(e[k]).replace(".", ",")} className="h-9 w-20 text-right tabular-nums" aria-label={`${rotulo} (%)`} />
        <span className="text-muted-foreground">%</span>
      </span>
    </label>
  )
  return (
    <details className="rounded-xl border px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">
        Estrutura de custos & taxas
        <span className="ml-2 font-normal text-muted-foreground">
          total de deduções {percentual(e.total_pct)}{e.personalizada ? "" : " (padrão da planilha)"}
        </span>
      </summary>
      <FormAcao acao={salvar} limparAoSalvar={false} className="mt-3 gap-4 sm:grid-cols-2">
        <fieldset className="grid content-start gap-2">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Variáveis (% do preço) · {percentual(e.variaveis_pct)}</legend>
          {VARIAVEIS.map(campo)}
        </fieldset>
        <fieldset className="grid content-start gap-2">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estrutura (% do preço) · {percentual(e.estrutura_pct + e.investimento_lucro_pct)}</legend>
          {ESTRUTURA.map(campo)}
          <div className="mt-2 flex items-baseline justify-between border-t pt-2">
            <span className="text-sm font-medium">Total deduções</span>
            <span className="text-xl font-semibold tabular-nums">{percentual(e.total_pct)}</span>
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <BotaoEnviar>Salvar estrutura</BotaoEnviar>
          <span className="text-xs text-muted-foreground">
            Preço ideal = custo ÷ (1 − total de deduções): é o preço em que sobra exatamente o investimento / lucro.
          </span>
        </div>
      </FormAcao>
      {e.personalizada ? (
        <FormAcao acao={restaurar} className="mt-2">
          <BotaoEnviar variant="ghost" className="h-8 w-fit px-2 text-xs text-muted-foreground underline">Restaurar padrão da planilha</BotaoEnviar>
        </FormAcao>
      ) : null}
    </details>
  )
}

import { custoPorUnidade, numero, percentual, reais, rotuloUnidade } from "@/lib/formato"
import { agruparPorEtapa } from "@/components/ficha-producao"

// Linha devolvida por ficha_gerencial (custos calculados pelo banco)
export type LinhaGerencial = {
  versao_id: string
  versao_numero: number
  ordem: number
  etapa: string | null
  componente: string
  tipo: "insumo" | "subproduto"
  quantidade: number
  unidade: string
  quantidade_base: number
  unidade_base: string
  custo_unitario_base: number | null
  custo: number | null
  participacao_pct: number | null
}

export function TabelaCustos({ linhas, rodape }: { linhas: LinhaGerencial[]; rodape?: React.ReactNode }) {
  if (!linhas.length) return <p className="text-sm text-muted-foreground">Nenhum componente ainda.</p>
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Componente</th>
            <th className="px-3 py-2 text-right">Quantidade</th>
            <th className="px-3 py-2 text-right">Custo unitário</th>
            <th className="px-3 py-2 text-right">Custo</th>
            <th className="px-3 py-2 text-right">%</th>
          </tr>
        </thead>
        {agruparPorEtapa(linhas).map(([etapa, itens]) => (
          <tbody key={etapa} className="divide-y border-t">
            <tr><td colSpan={5} className="bg-muted/30 px-3 py-1.5 text-xs font-semibold capitalize">{etapa}</td></tr>
            {itens.map((l) => (
              <tr key={`${l.ordem}-${l.componente}`}>
                <td className="px-3 py-2">{l.componente}{l.tipo === "subproduto" ? <span className="text-xs text-muted-foreground"> (subproduto)</span> : null}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{numero(l.quantidade)} {rotuloUnidade(l.unidade)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {l.custo_unitario_base == null ? <span className="text-destructive">sem preço</span> : custoPorUnidade(l.custo_unitario_base, l.unidade_base)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{l.custo == null ? "—" : reais(l.custo)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">{percentual(l.participacao_pct)}</td>
              </tr>
            ))}
          </tbody>
        ))}
        {rodape ? <tfoot className="border-t bg-muted/30">{rodape}</tfoot> : null}
      </table>
    </div>
  )
}

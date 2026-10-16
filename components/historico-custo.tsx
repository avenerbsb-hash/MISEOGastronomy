import { custoPorUnidade, dataCurta, reais, type Dimensao } from "@/lib/formato"
import type { LinhaHistoricoCusto } from "@/lib/dados"
import { BadgeVariacao } from "@/components/variacao"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

// Histórico de custo da ficha (mais recente primeiro), calculado pelo banco com a receita atual
export function HistoricoCusto({ linhas, dimensao, casa }: { linhas: LinhaHistoricoCusto[]; dimensao: Dimensao; casa: string }) {
  const valor = (v: number | null) => (v == null ? "—" : dimensao === "contagem" ? reais(v) : custoPorUnidade(v, dimensao))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico de custo</CardTitle>
        <CardDescription>
          Cada data em que uma compra mudou o custo desta ficha em {casa} (com a receita atual).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda não há compras registradas dos insumos desta ficha nesta casa.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2 text-right">Custo</th>
                  <th className="px-3 py-2">Variação</th>
                  <th className="px-3 py-2">O que mudou</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {linhas.map((l) => (
                  <tr key={l.data}>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{dataCurta(l.data)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">{valor(l.custo)}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {l.custo_anterior == null
                        ? <span className="text-xs text-muted-foreground">primeiro registro</span>
                        : <BadgeVariacao sinal={l.sinal} pct={l.variacao_pct} />}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">compra de {l.insumos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

import { custoPorUnidade, dataCurta, percentual, type Dimensao } from "@/lib/formato"
import { CORES_STATUS } from "@/components/status-preco"

// Ranking de fornecedores das últimas compras: valores calculados por fornecedores_do_insumo (0010)
export type LinhaFornecedor = {
  fornecedor_id: string | null; fornecedor: string; compras: number
  custo_medio: number; menor_custo: number; maior_custo: number; ultima_compra: string
  posicao: "melhor" | "pior" | "intermediario" | "unico" | null; economia_pct: number | null
}

export function FornecedoresInsumo({ linhas, dim, compras }: { linhas: LinhaFornecedor[]; dim: Dimensao; compras: number }) {
  const total = linhas.reduce((t, l) => t + l.compras, 0)
  const melhor = linhas.find((l) => l.posicao === "melhor")
  const pior = linhas.find((l) => l.posicao === "pior")
  const unico = linhas.find((l) => l.posicao === "unico")
  const resumo = (l: LinhaFornecedor) =>
    `média ${custoPorUnidade(l.custo_medio, dim)} · ${l.compras} ${l.compras === 1 ? "compra" : "compras"} · última ${dataCurta(l.ultima_compra)}`

  return (
    <section className="grid gap-2 border-t pt-4">
      <h3 className="text-sm font-semibold">
        Fornecedores <span className="font-normal text-muted-foreground">· {total < compras ? `${total} ${total === 1 ? "compra" : "compras"}` : `últimas ${compras} compras`}</span>
      </h3>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">Ainda não há compras validadas deste insumo nesta casa.</p>
      ) : (
        <>
          {melhor && pior ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Destaque titulo="▼ Melhor fornecedor" cor={CORES_STATUS.caiu} nome={melhor.fornecedor} texto={resumo(melhor)} />
              <Destaque titulo="▲ Pior fornecedor" cor={CORES_STATUS.subiu} nome={pior.fornecedor} texto={resumo(pior)}
                extra={pior.economia_pct != null ? `Comprando no melhor, economia de ${percentual(pior.economia_pct)}` : undefined} />
            </div>
          ) : unico ? (
            <Destaque titulo="Único fornecedor nessas compras" cor={CORES_STATUS.estavel} nome={unico.fornecedor} texto={resumo(unico)} />
          ) : (
            <p className="text-sm text-muted-foreground">As compras não têm fornecedor informado.</p>
          )}
          {linhas.length > 1 ? (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5">Fornecedor</th>
                    <th className="px-3 py-1.5 text-right">Compras</th>
                    <th className="px-3 py-1.5 text-right">Média</th>
                    <th className="px-3 py-1.5 text-right">Menor – maior</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {linhas.map((l) => (
                    <tr key={l.fornecedor_id ?? "sem"} className={l.fornecedor_id ? undefined : "text-muted-foreground"}>
                      <td className="px-3 py-1.5">{l.fornecedor}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{l.compras}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums"
                        style={l.posicao === "melhor" ? { color: CORES_STATUS.caiu.texto } : l.posicao === "pior" ? { color: CORES_STATUS.subiu.texto } : undefined}>
                        {custoPorUnidade(l.custo_medio, dim)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                        {l.menor_custo === l.maior_custo ? "—" : `${custoPorUnidade(l.menor_custo, dim)} – ${custoPorUnidade(l.maior_custo, dim)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

function Destaque({ titulo, cor, nome, texto, extra }: { titulo: string; cor: { texto: string; fundo: string }; nome: string; texto: string; extra?: string }) {
  return (
    <div className="grid gap-0.5 rounded-lg px-3 py-2" style={{ backgroundColor: cor.fundo }}>
      <span className="text-xs font-semibold" style={{ color: cor.texto }}>{titulo}</span>
      <span className="font-medium">{nome}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{texto}</span>
      {extra ? <span className="text-xs font-medium" style={{ color: cor.texto }}>{extra}</span> : null}
    </div>
  )
}

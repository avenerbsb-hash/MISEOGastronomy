import Link from "next/link"
import { percentual, reais } from "@/lib/formato"
import { CORES_STATUS, COR_TODOS } from "@/components/status-preco"
import { cn } from "@/lib/utils"

// Painel de CMV da casa: só exibe o que painel_cmv_casa / cmv_da_casa calcularam no banco
export type LinhaCmv = {
  item_id: string; receita_id: string; cardapio: string; produto: string
  custo_porcao: number | null; preco_publicado: number | null; cmv_atual_pct: number | null; margem_atual: number | null
  cmv_ref_pct: number | null; preco_manter_cmv: number | null; preco_manter_margem: number | null
  meta_pct: number; meta_definida: boolean
  preco_meta: number | null; cmv_preco_meta_pct: number | null; ajuste_meta_pct: number | null
  situacao: "acima_da_meta" | "dentro_da_meta" | "sem_preco" | "sem_custo"
}

export const FILTROS_CMV = [
  { valor: "", rotulo: "Todos" },
  { valor: "acima_da_meta", rotulo: "▲ Acima da meta" },
  { valor: "dentro_da_meta", rotulo: "Dentro da meta" },
  { valor: "sem_preco", rotulo: "Sem preço" },
  { valor: "sem_custo", rotulo: "Sem custo" },
  { valor: "desativados", rotulo: "Desativados" },
] as const

// Item desativado do cardápio (fora do painel e do CMV médio)
export type ItemDesativado = { item_id: string; receita_id: string; produto: string; cardapio: string }

export function PainelCmv({
  linhas, filtro, media, meta, metaDefinida, casa, formMeta, desativados = [], botaoItem,
}: {
  linhas: LinhaCmv[]; filtro: string; media: number | null; meta: number; metaDefinida: boolean; casa: string
  formMeta?: React.ReactNode
  desativados?: ItemDesativado[]
  // botão Ativar/Desativar (formulário com a ação do servidor), montado pela página
  botaoItem?: (itemId: string, ativar: boolean) => React.ReactNode
}) {
  const conta = (s: string) => (s === "desativados" ? desativados.length : linhas.filter((l) => !s || l.situacao === s).length)
  const visiveis = linhas.filter((l) => !filtro || l.situacao === filtro)
  const acima = conta("acima_da_meta")
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-semibold">Painel de CMV</h1>
        <p className="text-sm text-muted-foreground">Cardápio de {casa}, do CMV mais alto para o mais baixo, com o preço sugerido para a meta</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border px-4 py-3">
          <div className={cn("text-2xl font-semibold tabular-nums", media != null && media > meta && "text-[#DC2626]")}>{percentual(media)}</div>
          <div className="text-sm text-muted-foreground">CMV médio do cardápio</div>
        </div>
        <div className="rounded-xl border px-4 py-3">
          <div className="text-2xl font-semibold tabular-nums">{percentual(meta)}</div>
          <div className="text-sm text-muted-foreground">Meta de CMV da casa{metaDefinida ? "" : " (padrão)"}</div>
          {formMeta}
        </div>
        <Link href="/cmv?situacao=acima_da_meta" className="rounded-xl border px-4 py-3 hover:bg-muted/50">
          <div className={cn("text-2xl font-semibold tabular-nums", acima > 0 && "text-[#DC2626]")}>{acima}</div>
          <div className="text-sm text-muted-foreground">{acima === 1 ? "item acima da meta" : "itens acima da meta"}</div>
        </Link>
      </div>

      <nav aria-label="Filtrar por situação" className="flex flex-wrap gap-1.5">
        {FILTROS_CMV.map((f) => {
          const ativo = filtro === f.valor
          const cor = f.valor === "acima_da_meta" ? CORES_STATUS.subiu : f.valor === "dentro_da_meta" ? CORES_STATUS.caiu
            : f.valor === "sem_preco" ? CORES_STATUS.sem_preco : f.valor === "sem_custo" ? CORES_STATUS.sem_comparacao
            : f.valor === "desativados" ? CORES_STATUS.estavel : null
          return (
            <Link key={f.valor} href={f.valor ? `/cmv?situacao=${f.valor}` : "/cmv"} aria-current={ativo ? "page" : undefined}
              className={cn("rounded-full border px-3 py-1.5 text-sm", ativo && "border-transparent font-semibold")}
              style={ativo ? (cor ? { color: cor.texto, backgroundColor: cor.fundo } : { color: COR_TODOS.texto, backgroundColor: COR_TODOS.fundo }) : undefined}>
              {f.rotulo} <span className="tabular-nums opacity-70">{conta(f.valor)}</span>
            </Link>
          )
        })}
      </nav>

      {filtro === "desativados" ? (
        desativados.length === 0 ? (
          <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">Nenhum item desativado. Use “Desativar” na linha do item para tirá-lo do cardápio.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {desativados.map((d) => (
              <li key={d.item_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <Link href={`/fichas/${d.receita_id}`} className="font-medium hover:underline">{d.produto}</Link>
                  <div className="text-xs text-muted-foreground">{d.cardapio} · desativado</div>
                </div>
                {botaoItem?.(d.item_id, true)}
              </li>
            ))}
          </ul>
        )
      ) : visiveis.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
          {linhas.length ? "Nenhum item nesta situação." : "Nenhum item no cardápio desta casa. Defina o preço de venda nas fichas para elas entrarem aqui."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2 text-right">Custo</th>
                <th className="px-3 py-2 text-right">Preço</th>
                <th className="px-3 py-2 text-right">CMV</th>
                <th className="px-3 py-2 text-right">Margem</th>
                <th className="px-3 py-2 text-right">Preço para a meta</th>
                <th className="px-3 py-2 text-right">Manter CMV do item</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {visiveis.map((l) => {
                const acimaMeta = l.situacao === "acima_da_meta"
                return (
                  <tr key={l.item_id} className="align-top">
                    <td className="px-3 py-2">
                      <Link href={`/fichas/${l.receita_id}`} className="font-medium hover:underline">{l.produto}</Link>
                      <div className="text-xs text-muted-foreground">{l.cardapio}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{l.custo_porcao != null ? reais(l.custo_porcao) : <span className="text-xs text-muted-foreground">falta preço de insumo</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{reais(l.preco_publicado)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {l.cmv_atual_pct != null ? (
                        <span className="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
                          style={acimaMeta ? { color: CORES_STATUS.subiu.texto, backgroundColor: CORES_STATUS.subiu.fundo } : { color: CORES_STATUS.caiu.texto, backgroundColor: CORES_STATUS.caiu.fundo }}>
                          {percentual(l.cmv_atual_pct)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{reais(l.margem_atual)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {l.preco_meta != null ? (
                        <>
                          <b className={acimaMeta || l.situacao === "sem_preco" ? undefined : "font-normal text-muted-foreground"}>{reais(l.preco_meta)}</b>
                          <div className="text-xs text-muted-foreground">
                            CMV {percentual(l.cmv_preco_meta_pct)}{l.ajuste_meta_pct != null && acimaMeta ? ` · ${percentual(l.ajuste_meta_pct, true)}` : ""}
                          </div>
                        </>
                      ) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {l.preco_manter_cmv != null ? (
                        <>
                          {reais(l.preco_manter_cmv)}
                          <div className="text-xs text-muted-foreground">CMV {percentual(l.cmv_ref_pct)}</div>
                        </>
                      ) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/fichas/${l.receita_id}/preco`} className="text-sm font-medium underline">
                          {l.preco_publicado == null ? "Definir preço" : "Ajustar preço"}
                        </Link>
                        {botaoItem?.(l.item_id, false)}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Preço para a meta = custo ÷ meta da casa, arredondado pela regra da casa. &quot;Manter CMV do item&quot; usa o CMV que o item tinha
        quando o preço atual foi aprovado (itens de baixo CMV, como água, podem ficar abaixo da meta de propósito).
        Item desativado sai do painel e do CMV médio; o histórico de preços fica guardado e ele volta em “Desativados → Ativar”.
      </p>
    </div>
  )
}

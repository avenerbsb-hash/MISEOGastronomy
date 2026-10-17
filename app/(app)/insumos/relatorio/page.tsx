import type { Metadata } from "next"
import Link from "next/link"
import { exigirCustos, obterSessao } from "@/lib/sessao"
import { custoPorUnidade, dataCurta, dataHora, hojeSP } from "@/lib/formato"
import { pctPreciso } from "@/components/indicador-preco"
import { BotaoImprimir } from "@/components/botao-imprimir"
import { cn } from "@/lib/utils"
import { carregarInsumos, FILTROS, ORDENS, type ParamsInsumos } from "../dados"

// O título vira o nome sugerido do arquivo PDF
export async function generateMetadata(): Promise<Metadata> {
  const s = await obterSessao()
  return { title: { absolute: `Relatório de insumos · ${s.casa?.nome ?? ""} · ${dataCurta(hojeSP())}` } }
}

export default async function RelatorioInsumos({ searchParams }: { searchParams: Promise<ParamsInsumos> }) {
  const s = await exigirCustos()
  const params = await searchParams
  const { q, categoria, filtro, ordem, nomes, variacoes, indicadores, sit, insumos, contagem } = await carregarInsumos(s.casa.id, params)

  const filtrosUsados = [
    q ? `busca “${q}”` : null,
    categoria ? `categoria ${nomes.get(categoria)}` : null,
    filtro ? FILTROS.find((f) => f.valor === filtro)?.rotulo.replace(/^[▲▼=]\s*/, "") : null,
  ].filter(Boolean)
  const voltar = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString()

  return (
    <div className="relatorio grid gap-4 text-sm print:gap-3 print:text-[10.5px]">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={voltar ? `/insumos?${voltar}` : "/insumos"} className="text-muted-foreground hover:underline">← Voltar para Insumos</Link>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">Na janela que abrir, escolha “Salvar como PDF”.</span>
          <BotaoImprimir />
        </div>
      </div>

      <header className="grid gap-1 border-b pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-semibold print:text-lg">Relatório de insumos · {s.casa.nome}</h1>
          <span className="text-muted-foreground">MISEO · gerado em {dataHora(new Date().toISOString())}</span>
        </div>
        <p className="text-muted-foreground">
          Custo da última compra validada por kg, L ou unidade. Ordenado por {ORDENS[ordem].toLowerCase()}
          {filtrosUsados.length ? ` · filtros: ${filtrosUsados.join(" · ")}` : " · todos os insumos"}.
        </p>
      </header>

      <section className="grid grid-cols-3 gap-2 sm:grid-cols-6 print:grid-cols-6">
        {FILTROS.map((f) => (
          <div key={f.valor || "todos"} className={cn("rounded-lg border px-3 py-2", filtro === f.valor && "border-foreground")}>
            <div className="text-xs text-muted-foreground">{f.rotulo}</div>
            <div className="text-lg font-semibold tabular-nums print:text-base">{contagem.get(f.valor) ?? 0}</div>
          </div>
        ))}
      </section>

      {insumos.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-muted-foreground">Nenhum insumo com esses filtros.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1.5 pr-2 font-medium">Código</th>
              <th className="py-1.5 pr-2 font-medium">Insumo</th>
              <th className="py-1.5 pr-2 font-medium">Categoria</th>
              <th className="py-1.5 pr-2 text-right font-medium">Custo atual</th>
              <th className="py-1.5 pr-2 text-right font-medium">Anterior</th>
              <th className="py-1.5 pr-2 text-right font-medium">Variação</th>
              <th className="py-1.5 text-right font-medium">Compra</th>
            </tr>
          </thead>
          <tbody>
            {insumos.map((i) => {
              // indicador A (0012) quando disponível; senão a variação antiga
              const ind = indicadores?.get(i.id)
              const v = variacoes.get(i.id)
              const st = sit(i.id)
              const pct = ind ? ind.variacao_ultima_pct : v?.variacao_pct
              const atual = ind ? ind.ultimo_preco ?? ind.custo_oficial : v?.custo_atual
              const anterior = ind ? ind.preco_anterior : v?.custo_anterior
              const data = ind ? ind.data_ultima_compra : v?.data_referencia
              return (
                <tr key={i.id} className="break-inside-avoid border-b border-border/60 align-top">
                  <td className="py-1.5 pr-2 whitespace-nowrap text-muted-foreground">{i.codigo}</td>
                  <td className="py-1.5 pr-2 font-medium">{i.nome}{!i.ativo ? " (inativo)" : ""}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{i.categoria_id ? nomes.get(i.categoria_id)?.split(" › ").pop() : "—"}</td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap tabular-nums">{atual != null ? custoPorUnidade(atual, i.dimensao) : "sem preço"}</td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap tabular-nums text-muted-foreground">{anterior != null ? custoPorUnidade(anterior, i.dimensao) : "—"}</td>
                  <td className={cn(
                    "py-1.5 pr-2 text-right whitespace-nowrap tabular-nums",
                    st === "subiu" && "text-alta", st === "caiu" && "text-queda",
                  )}>
                    {st === "subiu" ? "▲ " : st === "caiu" ? "▼ " : ""}
                    {(st === "subiu" || st === "caiu") && pct != null ? pctPreciso(pct)
                      : st === "estavel" ? "= 0,0%" : st === "sem_comparacao" ? "sem comparação" : "—"}
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap tabular-nums text-muted-foreground">{data ? dataCurta(data) : "—"}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p className="text-xs text-muted-foreground">
        {insumos.length} insumo(s) · valores de {s.casa.nome}. A variação compara a última compra validada com a anterior.
      </p>
    </div>
  )
}

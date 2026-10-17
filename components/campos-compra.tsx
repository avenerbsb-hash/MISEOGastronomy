"use client"

import { useEffect, useState, useTransition } from "react"
import { Campo, Entrada, Selecao } from "@/components/campos"
import { custoPorUnidade, type Dimensao } from "@/lib/formato"
import { pctPreciso } from "@/components/indicador-preco"
import { previaCompra, type PreviaCompra } from "@/app/(app)/insumos/actions"

// Quantidade, unidade e valor da compra, com a prévia do custo unitário (calculada no banco) antes de salvar
export function CamposCompra({ insumoId, dim, unidades, rotuloQuantidade = "Quantidade", desabilitado = false }: {
  insumoId: string; dim: Dimensao; unidades: { codigo: string; nome: string }[]; rotuloQuantidade?: string; desabilitado?: boolean
}) {
  const [qtd, setQtd] = useState("")
  const [un, setUn] = useState(unidades[0]?.codigo ?? "")
  const [valor, setValor] = useState("")
  const [previa, setPrevia] = useState<PreviaCompra | null>(null)
  const [, iniciar] = useTransition()

  useEffect(() => { setUn(unidades[0]?.codigo ?? "") }, [insumoId, unidades])
  useEffect(() => {
    if (!insumoId || !qtd.trim() || !valor.trim()) { setPrevia(null); return }
    const t = setTimeout(() => iniciar(async () => setPrevia(await previaCompra(insumoId, qtd, un, valor))), 350)
    return () => clearTimeout(t)
  }, [insumoId, qtd, un, valor])

  return (
    <>
      <Campo rotulo={rotuloQuantidade}>
        <Entrada name="quantidade" inputMode="decimal" required value={qtd} onChange={(e) => setQtd(e.target.value)}
          placeholder={dim === "massa" ? "ex.: 1,5" : "ex.: 6"} disabled={desabilitado} className="h-11" />
      </Campo>
      <Campo rotulo="Unidade">
        <Selecao name="unidade" value={un} onChange={(e) => setUn(e.target.value)} required disabled={desabilitado} className="h-11">
          {unidades.map((u) => <option key={u.codigo} value={u.codigo}>{u.nome}</option>)}
        </Selecao>
      </Campo>
      <Campo rotulo="Valor total pago (R$)">
        <Entrada name="valor_total" inputMode="decimal" required value={valor} onChange={(e) => setValor(e.target.value)}
          placeholder="ex.: 10,00" disabled={desabilitado} className="h-11" />
      </Campo>
      <div aria-live="polite" className="sm:col-span-full">
        {previa ? (
          <div className={`grid gap-0.5 rounded-lg px-3 py-2 text-sm ${previa.vai_conferir ? "bg-alta-fundo text-alta" : "bg-muted"}`}>
            <span>Custo desta compra: <b className="tabular-nums">{custoPorUnidade(previa.custo_base, dim)}</b>
              {previa.custo_atual != null && previa.variacao_pct != null ? (
                <> · atual {custoPorUnidade(previa.custo_atual, dim)} ({previa.variacao_pct > 0 ? "▲ " : previa.variacao_pct < 0 ? "▼ " : ""}{pctPreciso(previa.variacao_pct)})</>
              ) : " · primeira compra nesta casa"}
            </span>
            <span className="text-xs">
              {previa.vai_conferir
                ? `Acima do limite de ${pctPreciso(previa.limite_pct, false)}: vai entrar Em validação — custo mantido até a conferência.`
                : "Ao salvar: Validada — custo atualizado na hora."}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Informe quantidade e valor para ver o custo unitário antes de salvar.</p>
        )}
      </div>
    </>
  )
}

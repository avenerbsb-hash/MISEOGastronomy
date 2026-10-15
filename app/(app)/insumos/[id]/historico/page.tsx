import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { custoPorUnidade, dataCurta, dataHora, numero, reais, rotuloUnidade } from "@/lib/formato"
import { Badge } from "@/components/ui/badge"

type Linha = {
  id: string; data_compra: string; quantidade: number; unidade: string; valor_total: number
  custo_unitario_base: number; fonte: string; status: "pendente" | "validado" | "rejeitado"
  documento_ref: string | null; observacao: string | null; validado_em: string | null
  fornecedores: { nome: string } | null
}

const FONTE: Record<string, string> = {
  manual: "Manual", planilha: "Planilha", nfe_xml: "NF-e (XML)", nfe_pdf: "NF-e (PDF)",
  relatorio_nfe: "Relatório de notas", referencia: "Referência de outra casa",
}

export default async function HistoricoInsumo({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirCustos()
  const { id } = await params
  const supabase = await createClient()
  const [{ data: insumo }, { data, error }] = await Promise.all([
    supabase.from("insumos").select("dimensao").eq("id", id).single(),
    supabase.from("historico_precos")
      .select("id, data_compra, quantidade, unidade, valor_total, custo_unitario_base, fonte, status, documento_ref, observacao, validado_em, fornecedores(nome)")
      .eq("insumo_id", id).eq("estabelecimento_id", s.casa.id)
      .order("data_compra", { ascending: false }).order("criado_em", { ascending: false }),
  ])
  const linhas = (data ?? []) as unknown as Linha[]
  const dim = insumo?.dimensao ?? "massa"

  if (error) return <p className="text-sm text-destructive">Não foi possível carregar o histórico.</p>
  if (!linhas.length) return <p className="text-sm text-muted-foreground">Nenhuma compra registrada em {s.casa.nome}.</p>

  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">
        {linhas.length} registros em {s.casa.nome}. O histórico não se edita: para corrigir, registre uma nova compra.
      </p>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Fornecedor</th>
              <th className="px-3 py-2 text-right">Quantidade</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-right">Custo</th>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2">Origem</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {linhas.map((l) => (
              <tr key={l.id} className={l.status === "rejeitado" ? "text-muted-foreground line-through decoration-1" : ""}>
                <td className="whitespace-nowrap px-3 py-2">{dataCurta(l.data_compra)}</td>
                <td className="px-3 py-2">{l.fornecedores?.nome ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{numero(l.quantidade)} {rotuloUnidade(l.unidade)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{reais(l.valor_total)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{custoPorUnidade(l.custo_unitario_base, dim)}</td>
                <td className="px-3 py-2">
                  <Badge variant={l.status === "validado" ? "secondary" : l.status === "pendente" ? "outline" : "destructive"}>
                    {l.status === "validado" ? "Validado" : l.status === "pendente" ? "Pendente" : "Rejeitado"}
                  </Badge>
                  {l.validado_em ? <div className="mt-0.5 text-xs text-muted-foreground no-underline">{dataHora(l.validado_em)}</div> : null}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {FONTE[l.fonte] ?? l.fonte}{l.documento_ref ? ` · NF ${l.documento_ref}` : ""}
                  {l.observacao ? <div className="max-w-xs whitespace-normal">{l.observacao}</div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

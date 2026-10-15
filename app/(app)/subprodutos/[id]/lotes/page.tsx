import { createClient } from "@/lib/supabase/server"
import { exigirCasa } from "@/lib/sessao"
import { dataHora, numero, percentual, rotuloUnidade, UNIDADES_POR_DIMENSAO, type Dimensao } from "@/lib/formato"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FormAcao, BotaoEnviar } from "@/components/form-acao"
import { Campo, Entrada, Selecao } from "@/components/campos"
import { registrarLote } from "../../actions"

type Lote = {
  lote_id: string; receita: string; versao: number; produzido_em: string
  esperado: number; obtido: number | null; unidade_base: string; desvio_pct: number | null; alerta: boolean
}

// Rendimento real x padrão. Nenhum valor em R$ nesta tela (vale para produção).
export default async function Lotes({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirCasa()
  const { id } = await params
  const supabase = await createClient()
  const [{ data: receita }, { data: vigente }, rel] = await Promise.all([
    supabase.from("receitas").select("nome, dimensao_saida").eq("id", id).single(),
    supabase.from("versoes_receita").select("id, numero, rendimento_quantidade, rendimento_unidade")
      .eq("receita_id", id).eq("status", "aprovada").maybeSingle(),
    supabase.rpc("rendimento_lotes", { p_estab: s.casa.id }),
  ])
  const dim = (receita?.dimensao_saida ?? "massa") as Dimensao
  const lotes = ((rel.data ?? []) as Lote[]).filter((l) => l.receita === receita?.nome)
  const unidades = UNIDADES_POR_DIMENSAO[dim]

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Registrar lote</CardTitle>
          <CardDescription>
            {vigente
              ? `Versão ${vigente.numero}: rende ${numero(vigente.rendimento_quantidade)} ${rotuloUnidade(vigente.rendimento_unidade)} por receita.`
              : "Precisa de uma versão aprovada para registrar lotes."}
          </CardDescription>
        </CardHeader>
        {vigente ? (
          <CardContent>
            <FormAcao acao={registrarLote.bind(null, vigente.id, id)}>
              <Campo rotulo="Quantas receitas" dica="1 = receita normal; 2 = receita dobrada.">
                <Entrada name="fator_escala" inputMode="decimal" defaultValue="1" required />
              </Campo>
              <div className="grid grid-cols-[1fr_5.5rem] gap-3">
                <Campo rotulo="Quantidade obtida"><Entrada name="quantidade_obtida" inputMode="decimal" required /></Campo>
                <Campo rotulo="Unidade">
                  <Selecao name="unidade" defaultValue={unidades[0].codigo}>
                    {unidades.map((u) => <option key={u.codigo} value={u.codigo}>{u.nome}</option>)}
                  </Selecao>
                </Campo>
              </div>
              <Campo rotulo="Perdas"><Entrada name="perdas_descricao" maxLength={300} placeholder="evaporação, aparas…" /></Campo>
              <Campo rotulo="Observações"><Entrada name="observacoes" maxLength={500} /></Campo>
              <div><BotaoEnviar>Registrar lote</BotaoEnviar></div>
            </FormAcao>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rendimento dos lotes em {s.casa.nome}</CardTitle>
          <CardDescription>Alerta quando o desvio passa da tolerância da casa</CardDescription>
        </CardHeader>
        <CardContent>
          {rel.error ? <p className="text-sm text-destructive">Não foi possível carregar os lotes.</p> : null}
          {lotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lote registrado.</p>
          ) : (
            <ul className="divide-y">
              {lotes.map((l) => (
                <li key={l.lote_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span>
                    {dataHora(l.produzido_em)} · versão {l.versao}
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      esperado {numero(l.esperado)} {rotuloUnidade(l.unidade_base)} · obtido {l.obtido == null ? "unidade inválida" : `${numero(l.obtido)} ${rotuloUnidade(l.unidade_base)}`}
                    </span>
                  </span>
                  <span className={l.alerta ? "rounded-md bg-red-500/10 px-2 py-0.5 font-medium text-red-700 dark:text-red-400" : "rounded-md bg-muted px-2 py-0.5 text-muted-foreground"}>
                    {l.alerta ? "▲ Alerta " : ""}{percentual(l.desvio_pct, true)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

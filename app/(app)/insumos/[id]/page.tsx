import Link from "next/link"
import { CamposCompra } from "@/components/campos-compra"
import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { indicadoresDaCasa, mesDoParametro, variacoesDaCasa } from "@/lib/dados"
import { IndicadoresInsumo, type LinhaMensal, type LinhaAcumulado } from "@/components/indicadores-insumo"
import { custoPorUnidade, dataCurta, hojeSP, numero, reais, rotuloUnidade, ultimosMeses, UNIDADES_POR_DIMENSAO, type Dimensao } from "@/lib/formato"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { BadgeVariacao, Variacao } from "@/components/variacao"
import { FormAcao, BotaoEnviar } from "@/components/form-acao"
import { Campo, Entrada, Selecao } from "@/components/campos"
import { FornecedoresInsumo, type LinhaFornecedor } from "@/components/fornecedores-insumo"
import { registrarCompra, validarPreco } from "../actions"

// Quantas compras entram no ranking de fornecedores
const COMPRAS_RANKING = 10

type Pendente = {
  id: string; data_compra: string; quantidade: number; unidade: string; valor_total: number
  custo_unitario_base: number; documento_ref: string | null; observacao: string | null
  fornecedores: { nome: string } | null
}

export default async function ResumoInsumo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string }> }) {
  const s = await exigirCustos()
  const { id } = await params
  const mesISO = mesDoParametro((await searchParams).mes)
  const supabase = await createClient()

  const [{ data: insumo }, variacoes, medir, fornecedores, pendentes, impactadas, ranking, indicadores, mensal, acumulado] = await Promise.all([
    supabase.from("insumos").select("nome, dimensao").eq("id", id).single(),
    variacoesDaCasa(s.casa.id),
    supabase.from("alias_insumo").select("descricao_original").eq("insumo_id", id).eq("medir_no_recebimento", true),
    supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("historico_precos")
      .select("id, data_compra, quantidade, unidade, valor_total, custo_unitario_base, documento_ref, observacao, fornecedores(nome)")
      .eq("insumo_id", id).eq("estabelecimento_id", s.casa.id).eq("status", "pendente")
      .order("data_compra", { ascending: false }),
    // impacto % por ficha (0009); sem a migração, cai na lista simples
    supabase.rpc("impacto_insumo_fichas", { p_insumo: id, p_estab: s.casa.id })
      .then((r) => (r.error ? supabase.rpc("fichas_impactadas", { p_insumo: id, p_estab: s.casa.id }) : r)),
    supabase.rpc("fornecedores_do_insumo", { p_insumo: id, p_estab: s.casa.id, p_compras: COMPRAS_RANKING }),
    // indicadores A/B/C e histórico mensal (0012); sem a migração o card não aparece
    indicadoresDaCasa(s.casa.id, mesISO),
    supabase.rpc("historico_mensal_insumo", { p_insumo: id, p_estab: s.casa.id, p_meses: 12 }),
    // acumulado do ano (0015); sem a migração, o card do acumulado não aparece
    supabase.rpc("acumulado_anual_insumo", { p_insumo: id, p_estab: s.casa.id, p_meses: 12 }),
  ])
  if (!insumo) return null
  const dim = insumo.dimensao as Dimensao
  const v = variacoes.get(id)
  const medirNoRecebimento = (medir.data ?? []).length > 0
  const unidades = UNIDADES_POR_DIMENSAO[dim]
  const fichas = (impactadas.data ?? []) as {
    receita_id: string; receita: string; tipo: "subproduto" | "final"
    custo_atual?: number | null; impacto_pct?: number | null; sinal?: string
  }[]
  const comImpacto = fichas.some((f) => f.sinal !== undefined)

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      {indicadores && !mensal.error ? (
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div className="grid gap-1">
              <CardTitle>Inteligência de preços</CardTitle>
              <CardDescription>Compras validadas em {s.casa.nome}. Pendentes, rejeitadas e preços de referência não entram.</CardDescription>
            </div>
            <form className="flex items-center gap-2">
              <Selecao name="mes" defaultValue={mesISO?.slice(0, 7) ?? ""} aria-label="Mês" className="h-9 w-auto">
                {ultimosMeses(12).map((m, k) => <option key={m.valor} value={k === 0 ? "" : m.valor}>{m.rotulo}{k === 0 ? " (atual)" : ""}</option>)}
              </Selecao>
              <button type="submit" className="h-9 rounded-md border px-3 text-sm hover:bg-muted">Ver mês</button>
            </form>
          </CardHeader>
          <CardContent>
            <IndicadoresInsumo ind={indicadores.get(id)} historico={(mensal.data ?? []) as LinhaMensal[]}
              acumulado={acumulado.error ? null : (acumulado.data ?? []) as LinhaAcumulado[]} dim={dim} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Custo atual em {s.casa.nome}</CardTitle>
          <CardDescription>Última compra validada</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {v ? (
            <>
              <div className="text-3xl font-semibold">{custoPorUnidade(v.custo_atual, dim)}</div>
              <Variacao sinal={v.sinal} pct={v.variacao_pct} data={v.data_referencia} casa={s.casa.nome} />
              <p className="text-sm text-muted-foreground">
                Compra anterior: {custoPorUnidade(v.custo_anterior, dim)}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Ainda não há compra validada deste insumo nesta casa.</p>
          )}
          {/* sem a migração 0010 o quadro não aparece */}
          {!ranking.error ? <FornecedoresInsumo linhas={(ranking.data ?? []) as LinhaFornecedor[]} dim={dim} compras={COMPRAS_RANKING} /> : null}
        </CardContent>
      </Card>

      <Card id="registrar-compra" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Registrar compra</CardTitle>
          <CardDescription>Validada — custo atualizado na hora. Alta acima do limite da casa fica Em validação — custo mantido até a conferência em Compras.</CardDescription>
        </CardHeader>
        <CardContent>
          {medirNoRecebimento ? (
            <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              Item de peso ou contagem variável: {dim === "massa" ? "pese" : "conte"} no recebimento e informe a
              quantidade real em {unidades.map((u) => u.nome).join(" ou ")}. Não use a quantidade de caixas ou peças.
            </p>
          ) : null}
          <FormAcao acao={registrarCompra.bind(null, id)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Data da compra">
                <Entrada type="date" name="data_compra" defaultValue={hojeSP()} max={hojeSP()} required />
              </Campo>
              <Campo rotulo="Fornecedor">
                <Selecao name="fornecedor_id" defaultValue="">
                  <option value="">Não informado</option>
                  {(fornecedores.data ?? []).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </Selecao>
              </Campo>
              <CamposCompra insumoId={id} dim={dim} unidades={unidades}
                rotuloQuantidade={medirNoRecebimento ? (dim === "massa" ? "Peso medido" : "Quantidade contada") : "Quantidade"} />
              <Campo rotulo="Nº da nota">
                <Entrada name="documento_ref" maxLength={60} />
              </Campo>
            </div>
            <Campo rotulo="Observação">
              <Entrada name="observacao" maxLength={300} />
            </Campo>
            <div><BotaoEnviar>Registrar compra</BotaoEnviar></div>
          </FormAcao>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compras pendentes de validação</CardTitle>
          <CardDescription>{s.casa.nome}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {(pendentes.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma compra pendente.</p>
          ) : (
            ((pendentes.data ?? []) as unknown as Pendente[]).map((p) => (
              <div key={p.id} className="grid gap-2 rounded-lg border p-3">
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span>
                    {dataCurta(p.data_compra)} · {numero(p.quantidade)} {rotuloUnidade(p.unidade)} · {reais(p.valor_total)}
                    {p.fornecedores ? ` · ${p.fornecedores.nome}` : ""}
                  </span>
                  <span className="font-medium tabular-nums">{custoPorUnidade(p.custo_unitario_base, dim)}</span>
                </div>
                {p.observacao ? <p className="text-xs text-muted-foreground">{p.observacao}</p> : null}
                <FormAcao acao={validarPreco.bind(null, p.id)} className="grid-cols-[1fr_auto_auto] items-end">
                  <Entrada name="obs" placeholder="Observação (opcional)" aria-label="Observação" />
                  <BotaoEnviar name="decisao" value="validar">Validar</BotaoEnviar>
                  <BotaoEnviar name="decisao" value="rejeitar" variant="outline">Rejeitar</BotaoEnviar>
                </FormAcao>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fichas impactadas</CardTitle>
          <CardDescription>
            Receitas aprovadas que usam este insumo, direta ou indiretamente
            {comImpacto && v?.custo_anterior != null ? <>, e quanto a última mudança de preço dele ({v.variacao_pct != null ? <BadgeVariacao sinal={v.sinal} pct={v.variacao_pct} /> : null}) mexeu no custo de cada uma</> : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {impactadas.error ? (
            <p className="text-sm text-destructive">Não foi possível carregar as fichas impactadas.</p>
          ) : fichas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma ficha aprovada usa este insumo.</p>
          ) : (
            <ul className="divide-y">
              {fichas.map((f) => (
                <li key={f.receita_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <Link href={f.tipo === "subproduto" ? `/subprodutos/${f.receita_id}` : `/fichas/${f.receita_id}`} className="hover:underline">{f.receita}</Link>
                    <div className="text-xs text-muted-foreground">
                      {f.tipo === "subproduto" ? "Subproduto" : "Ficha final"}
                      {f.tipo === "final" && f.custo_atual != null ? ` · custo da porção ${reais(f.custo_atual)}` : ""}
                    </div>
                  </div>
                  {comImpacto ? (
                    f.impacto_pct != null
                      ? <span className="shrink-0" title="Impacto da última mudança de preço deste insumo no custo da receita"><BadgeVariacao sinal={f.sinal} pct={f.impacto_pct} /></span>
                      : <span className="shrink-0 text-xs text-muted-foreground">sem comparação</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

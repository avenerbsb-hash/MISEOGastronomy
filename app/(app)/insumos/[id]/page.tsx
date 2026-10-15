import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { variacoesDaCasa } from "@/lib/dados"
import { custoPorUnidade, dataCurta, hojeSP, numero, reais, rotuloUnidade, UNIDADES_POR_DIMENSAO, type Dimensao } from "@/lib/formato"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Variacao } from "@/components/variacao"
import { FormAcao, BotaoEnviar } from "@/components/form-acao"
import { Campo, Entrada, Selecao } from "@/components/campos"
import { registrarCompra, validarPreco } from "../actions"

type Pendente = {
  id: string; data_compra: string; quantidade: number; unidade: string; valor_total: number
  custo_unitario_base: number; documento_ref: string | null; observacao: string | null
  fornecedores: { nome: string } | null
}

export default async function ResumoInsumo({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirCustos()
  const { id } = await params
  const supabase = await createClient()

  const [{ data: insumo }, variacoes, medir, fornecedores, pendentes, impactadas] = await Promise.all([
    supabase.from("insumos").select("nome, dimensao").eq("id", id).single(),
    variacoesDaCasa(s.casa.id),
    supabase.from("alias_insumo").select("descricao_original").eq("insumo_id", id).eq("medir_no_recebimento", true),
    supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("historico_precos")
      .select("id, data_compra, quantidade, unidade, valor_total, custo_unitario_base, documento_ref, observacao, fornecedores(nome)")
      .eq("insumo_id", id).eq("estabelecimento_id", s.casa.id).eq("status", "pendente")
      .order("data_compra", { ascending: false }),
    supabase.rpc("fichas_impactadas", { p_insumo: id, p_estab: s.casa.id }),
  ])
  if (!insumo) return null
  const dim = insumo.dimensao as Dimensao
  const v = variacoes.get(id)
  const medirNoRecebimento = (medir.data ?? []).length > 0
  const unidades = UNIDADES_POR_DIMENSAO[dim]
  const fichas = (impactadas.data ?? []) as { receita_id: string; receita: string; tipo: "subproduto" | "final" }[]

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registrar compra</CardTitle>
          <CardDescription>Entra como pendente; o custo só muda depois de validado.</CardDescription>
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
              <Campo rotulo={medirNoRecebimento ? (dim === "massa" ? "Peso medido" : "Quantidade contada") : "Quantidade"}>
                <Entrada name="quantidade" inputMode="decimal" required placeholder={dim === "massa" ? "19,4" : "30"} />
              </Campo>
              <Campo rotulo="Unidade">
                <Selecao name="unidade" defaultValue={unidades[0].codigo} required>
                  {unidades.map((u) => <option key={u.codigo} value={u.codigo}>{u.nome}</option>)}
                </Selecao>
              </Campo>
              <Campo rotulo="Valor total pago (R$)">
                <Entrada name="valor_total" inputMode="decimal" required placeholder="509,59" />
              </Campo>
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
          <CardDescription>Receitas aprovadas que usam este insumo, direta ou indiretamente</CardDescription>
        </CardHeader>
        <CardContent>
          {impactadas.error ? (
            <p className="text-sm text-destructive">Não foi possível carregar as fichas impactadas.</p>
          ) : fichas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma ficha aprovada usa este insumo.</p>
          ) : (
            <ul className="divide-y">
              {fichas.map((f) => (
                <li key={f.receita_id} className="flex justify-between gap-2 py-2 text-sm">
                  {f.tipo === "subproduto" ? (
                    <Link href={`/subprodutos/${f.receita_id}`} className="hover:underline">{f.receita}</Link>
                  ) : (
                    <span>{f.receita}</span>
                  )}
                  <span className="text-muted-foreground">{f.tipo === "subproduto" ? "Subproduto" : "Ficha final"}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

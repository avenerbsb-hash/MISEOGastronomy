import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { categorias, nomesCategorias } from "@/lib/dados"
import { numero, reais, rotuloUnidade, type Dimensao } from "@/lib/formato"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FormAcao, BotaoEnviar } from "@/components/form-acao"
import { Campo, Entrada, Selecao, AreaTexto } from "@/components/campos"
import { TabelaCustos, type LinhaGerencial } from "@/components/tabela-custos"
import { agruparPorEtapa } from "@/components/ficha-producao"
import { FormComponente, type Opcao } from "./form-componente"
import { EditarQuantidade } from "./editar-quantidade"
import { adicionarComponente, alterarComponente, aprovarVersao, criarRascunho, removerComponente, renomearReceita, salvarRascunho } from "../../actions"

type Componente = {
  id: string; ordem: number; etapa: string | null; quantidade: number; unidade: string; observacao: string | null
  insumos: { nome: string } | null
  receitas: { nome: string } | null
}

const UNIDADES_SAIDA: Record<Dimensao, { c: string; n: string }[]> = {
  massa: [{ c: "kg", n: "kg" }, { c: "g", n: "g" }],
  volume: [{ c: "l", n: "L" }, { c: "ml", n: "mL" }],
  contagem: [{ c: "un", n: "un" }],
}

export default async function Rascunho({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirCustos()
  const { id } = await params
  const supabase = await createClient()

  const [{ data: receita }, { data: versao }] = await Promise.all([
    supabase.from("receitas").select("nome, dimensao_saida").eq("id", id).single(),
    supabase.from("versoes_receita")
      .select("id, numero, rendimento_quantidade, rendimento_unidade, porcao_descricao, modo_preparo, validade_horas, observacoes")
      .eq("receita_id", id).eq("status", "rascunho").order("numero", { ascending: false }).limit(1).maybeSingle(),
  ])
  const dim = (receita?.dimensao_saida ?? "massa") as Dimensao
  // O nome vale para todas as versões: muda na hora, sem rascunho nem aprovação
  const cardNome = (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Nome</CardTitle>
        <CardDescription>Muda o nome em todas as versões e nas fichas que usam este item. Não precisa de aprovação.</CardDescription>
      </CardHeader>
      <CardContent>
        <FormAcao acao={renomearReceita.bind(null, id)} limparAoSalvar={false}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <Campo rotulo="Nome do item"><Entrada name="nome" defaultValue={receita?.nome ?? ""} maxLength={120} required /></Campo>
            </div>
            <BotaoEnviar variant="outline">Salvar nome</BotaoEnviar>
          </div>
        </FormAcao>
      </CardContent>
    </Card>
  )

  if (!versao) {
    return (
      <div className="grid gap-4">
      {cardNome}
      <Card>
        <CardHeader>
          <CardTitle>Nenhum rascunho em edição</CardTitle>
          <CardDescription>Crie um rascunho a partir da versão vigente para alterar a receita. A versão aprovada não muda até o novo rascunho ser aprovado.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormAcao acao={criarRascunho.bind(null, id)}><div><BotaoEnviar>Criar rascunho</BotaoEnviar></div></FormAcao>
        </CardContent>
      </Card>
      </div>
    )
  }

  const [componentes, insumos, subprodutos, previa, catsInsumo] = await Promise.all([
    supabase.from("componentes_receita")
      .select("id, ordem, etapa, quantidade, unidade, observacao, insumos(nome), receitas(nome)")
      .eq("versao_id", versao.id).order("ordem"),
    supabase.from("insumos").select("id, nome, dimensao, densidade_validada_em").eq("ativo", true).order("nome"),
    supabase.from("receitas").select("id, nome, dimensao_saida, densidade_validada_em")
      .eq("tipo", "subproduto").eq("ativo", true).neq("id", id).order("nome"),
    supabase.rpc("ficha_gerencial", { p_receita: id, p_estab: s.casa.id, p_versao: versao.id }),
    categorias("insumo"),
  ])
  const nomesCat = nomesCategorias(catsInsumo)
  const opcoesCategoria = catsInsumo.map((c) => ({ id: c.id, nome: nomesCat.get(c.id) ?? c.nome }))
  const lista = (componentes.data ?? []) as unknown as Componente[]
  const linhas = (previa.data ?? []) as LinhaGerencial[]
  // Total do rascunho: soma dos custos por componente que o banco calculou
  const completo = linhas.length > 0 && linhas.every((l) => l.custo != null)
  const total = completo ? linhas.reduce((t, l) => t + Number(l.custo), 0) : null
  const opcoesInsumo: Opcao[] = (insumos.data ?? []).map((i) => ({
    valor: `insumo:${i.id}`, nome: i.nome as string, dimensao: i.dimensao as Dimensao, densidade: !!i.densidade_validada_em,
  }))
  const opcoesSub: Opcao[] = (subprodutos.data ?? []).map((r) => ({
    valor: `subproduto:${r.id}`, nome: r.nome as string, dimensao: r.dimensao_saida as Dimensao, densidade: !!r.densidade_validada_em,
  }))
  const etapas = [...new Set(lista.map((c) => c.etapa).filter((e): e is string => !!e))]

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      {cardNome}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Prévia de custo · rascunho da versão {versao.numero}</CardTitle>
          <CardDescription>Preços validados de {s.casa.nome}. Rendimento: {numero(versao.rendimento_quantidade)} {rotuloUnidade(versao.rendimento_unidade)}</CardDescription>
        </CardHeader>
        <CardContent>
          <TabelaCustos
            linhas={linhas}
            rodape={linhas.length ? (
              <tr>
                <td className="px-3 py-2 font-semibold" colSpan={3}>Total do rascunho (para {numero(versao.rendimento_quantidade)} {rotuloUnidade(versao.rendimento_unidade)})</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{total != null ? reais(total) : "—"}</td>
                <td />
              </tr>
            ) : undefined}
          />
          {!completo && linhas.length ? (
            <p className="mt-2 text-sm text-destructive">Algum componente está sem preço validado nesta casa; o total aparece quando todos tiverem preço.</p>
          ) : null}
          {previa.error ? <p className="mt-2 text-sm text-destructive">Não foi possível calcular a prévia.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Componentes</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          {lista.length === 0 ? <p className="text-sm text-muted-foreground">Adicione o primeiro componente abaixo.</p> : null}
          {agruparPorEtapa(lista).map(([etapa, itens]) => (
            <section key={etapa}>
              <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{etapa}</h3>
              <ul className="divide-y rounded-lg border">
                {itens.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      {c.insumos?.nome ?? c.receitas?.nome}
                      {c.receitas ? <span className="text-xs text-muted-foreground"> (subproduto)</span> : null}
                      <EditarQuantidade acao={alterarComponente.bind(null, c.id, id)} quantidade={c.quantidade} unidade={c.unidade} />
                      {c.observacao ? <span className="block text-xs text-muted-foreground">{c.observacao}</span> : null}
                    </div>
                    <FormAcao acao={removerComponente.bind(null, c.id, id)}>
                      <BotaoEnviar variant="ghost" className="h-8 px-2 text-destructive">Remover</BotaoEnviar>
                    </FormAcao>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <div className="rounded-lg border p-3">
            <FormComponente acao={adicionarComponente.bind(null, versao.id, id)} insumos={opcoesInsumo} subprodutos={opcoesSub} etapas={etapas} categorias={opcoesCategoria} />
          </div>
        </CardContent>
      </Card>

      <div className="grid content-start gap-4">
        <Card>
          <CardHeader><CardTitle>Rendimento e preparo</CardTitle></CardHeader>
          <CardContent>
            <FormAcao acao={salvarRascunho.bind(null, versao.id, id)} limparAoSalvar={false}>
              <div className="grid grid-cols-[1fr_6rem] gap-3">
                <Campo rotulo="Rendimento padrão">
                  <Entrada name="rendimento_quantidade" inputMode="decimal" defaultValue={String(versao.rendimento_quantidade).replace(".", ",")} required />
                </Campo>
                <Campo rotulo="Unidade">
                  <Selecao name="rendimento_unidade" defaultValue={versao.rendimento_unidade}>
                    {UNIDADES_SAIDA[dim].map((u) => <option key={u.c} value={u.c}>{u.n}</option>)}
                  </Selecao>
                </Campo>
              </div>
              <div className="grid grid-cols-[1fr_7rem] gap-3">
                <Campo rotulo="Porção"><Entrada name="porcao_descricao" defaultValue={versao.porcao_descricao ?? ""} maxLength={200} /></Campo>
                <Campo rotulo="Validade (h)"><Entrada name="validade_horas" inputMode="numeric" defaultValue={versao.validade_horas ?? ""} /></Campo>
              </div>
              <Campo rotulo="Modo de preparo"><AreaTexto name="modo_preparo" defaultValue={versao.modo_preparo ?? ""} rows={6} /></Campo>
              <Campo rotulo="Observações"><AreaTexto name="observacoes" defaultValue={versao.observacoes ?? ""} rows={2} /></Campo>
              <div><BotaoEnviar variant="outline">Salvar rascunho</BotaoEnviar></div>
            </FormAcao>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aprovar versão {versao.numero}</CardTitle>
            <CardDescription>
              {s.admin
                ? "Ao aprovar, esta composição e este rendimento passam a valer a partir de agora; a versão atual fica arquivada."
                : "Somente o administrador central aprova versões."}
            </CardDescription>
          </CardHeader>
          {s.admin ? (
            <CardContent>
              <FormAcao acao={aprovarVersao.bind(null, versao.id, id)} limparAoSalvar={false}>
                <Campo rotulo="Motivo da alteração"><Entrada name="motivo" maxLength={200} placeholder="ex.: rendimento medido em 3 lotes" /></Campo>
                <div><BotaoEnviar>Aprovar</BotaoEnviar></div>
              </FormAcao>
            </CardContent>
          ) : null}
        </Card>
      </div>
    </div>
  )
}

import type { Metadata } from "next"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { custoPorUnidade, dataCurta, numero, reais, rotuloUnidade, UNIDADES_POR_DIMENSAO, type Dimensao } from "@/lib/formato"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FormAcao, BotaoEnviar } from "@/components/form-acao"
import { Entrada, Selecao } from "@/components/campos"
import { buttonVariants } from "@/components/ui/button"
import { validarPreco } from "../insumos/actions"
import { registrarRecebimento, removerLimite, resolverConferencia, salvarLimite } from "./actions"
import { categorias, nomesCategorias } from "@/lib/dados"
import { ConferenciaAberta, ConferenciasResolvidas, LimitesConferencia, type Conferencia, type Limite } from "@/components/conferencias"

export const metadata: Metadata = { title: "Pendências" }

type Preco = {
  id: string; data_compra: string; quantidade: number; unidade: string; valor_total: number
  custo_unitario_base: number; observacao: string | null
  insumos: { id: string; nome: string; dimensao: Dimensao } | null
  fornecedores: { nome: string } | null
}
type Nota = {
  id: string; data_compra: string; descricao_original: string; unidade_nota: string; quantidade_nota: number
  valor_total: number; status: "pendente" | "ignorado"; documento_ref: string | null
  insumos: { id: string; nome: string; dimensao: Dimensao } | null
  fornecedores: { nome: string } | null
}

export default async function Pendencias() {
  const s = await exigirCustos()
  const supabase = await createClient()
  const [precos, notas, abertas, resolvidas, limites, cats] = await Promise.all([
    supabase.from("historico_precos")
      .select("id, data_compra, quantidade, unidade, valor_total, custo_unitario_base, observacao, insumos(id, nome, dimensao), fornecedores(nome)")
      .eq("estabelecimento_id", s.casa.id).eq("status", "pendente")
      .order("data_compra", { ascending: false }),
    supabase.from("itens_importacao")
      .select("id, data_compra, descricao_original, unidade_nota, quantidade_nota, valor_total, status, documento_ref, insumos(id, nome, dimensao), fornecedores(nome)")
      .eq("estabelecimento_id", s.casa.id).in("status", ["pendente", "ignorado"]).not("insumo_id", "is", null)
      .order("data_compra", { ascending: false }).limit(200),
    // conferência de altas (0012); sem a migração, os cards não aparecem
    supabase.rpc("conferencias_da_casa", { p_estab: s.casa.id, p_abertas: true, p_limite: 200 }),
    supabase.rpc("conferencias_da_casa", { p_estab: s.casa.id, p_abertas: false, p_limite: 20 }),
    supabase.from("limites_conferencia_preco").select("id, categoria_id, limite_pct").eq("estabelecimento_id", s.casa.id),
    categorias("insumo"),
  ])
  const comConferencia = !abertas.error
  const conferencias = new Map(((abertas.data ?? []) as Conferencia[]).map((c) => [c.historico_preco_id, c]))
  const nomesCat = nomesCategorias(cats)
  const opcoesCat = cats.map((c) => ({ id: c.id, nome: nomesCat.get(c.id) ?? c.nome }))
  const listaPrecos = (precos.data ?? []) as unknown as Preco[]
  const listaNotas = (notas.data ?? []) as unknown as Nota[]

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Pendências</h1>
          <p className="text-sm text-muted-foreground">{s.casa.nome}</p>
        </div>
        <Link href="/pendencias/notas" className={buttonVariants({ className: "h-10 px-4" })}>Importar nota (XML)</Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Compras aguardando validação ({listaPrecos.length})</CardTitle>
          <CardDescription>
            O custo do insumo só muda depois de validado.
            {conferencias.size ? ` ${conferencias.size} com alta acima do limite: confira com justificativa.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {listaPrecos.length === 0 ? <p className="text-sm text-muted-foreground">Nada pendente.</p> : null}
          {listaPrecos.map((p) => conferencias.has(p.id) ? (
            <ConferenciaAberta key={p.id} c={conferencias.get(p.id)!} acao={resolverConferencia.bind(null, conferencias.get(p.id)!.id)} />
          ) : (
            <div key={p.id} className="grid gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span>
                  {p.insumos ? <Link href={`/insumos/${p.insumos.id}`} className="font-medium hover:underline">{p.insumos.nome}</Link> : "—"}
                  {" · "}{dataCurta(p.data_compra)} · {numero(p.quantidade)} {rotuloUnidade(p.unidade)} · {reais(p.valor_total)}
                  {p.fornecedores ? ` · ${p.fornecedores.nome}` : ""}
                </span>
                <span className="font-medium tabular-nums">{custoPorUnidade(p.custo_unitario_base, p.insumos?.dimensao ?? "massa")}</span>
              </div>
              <FormAcao acao={validarPreco.bind(null, p.id)} className="grid-cols-[1fr_auto_auto] items-end">
                <Entrada name="obs" placeholder="Observação (opcional)" aria-label="Observação" />
                <BotaoEnviar name="decisao" value="validar">Validar</BotaoEnviar>
                <BotaoEnviar name="decisao" value="rejeitar" variant="outline">Rejeitar</BotaoEnviar>
              </FormAcao>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notas aguardando pesagem ou contagem ({listaNotas.length})</CardTitle>
          <CardDescription>
            Itens de peso variável (caixas, peças, ovos, mel). Informe a quantidade real medida no recebimento.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {listaNotas.length === 0 ? <p className="text-sm text-muted-foreground">Nada aguardando.</p> : null}
          {listaNotas.map((n) => {
            const dim = n.insumos?.dimensao ?? "massa"
            const unidades = UNIDADES_POR_DIMENSAO[dim]
            return (
              <div key={n.id} className="grid gap-2 rounded-lg border p-3">
                <div className="text-sm">
                  <div className="font-medium">{n.insumos?.nome ?? "—"}</div>
                  <div className="text-muted-foreground">
                    {dataCurta(n.data_compra)} · Nota: {numero(n.quantidade_nota)} {n.unidade_nota} de “{n.descricao_original}” · {reais(n.valor_total)}
                    {n.fornecedores ? ` · ${n.fornecedores.nome}` : ""}
                    {n.status === "ignorado" ? " · sem pesagem registrada" : ""}
                  </div>
                </div>
                <FormAcao acao={registrarRecebimento.bind(null, n.id)} className="grid-cols-[1fr_6rem_auto] items-end">
                  <Entrada name="quantidade" inputMode="decimal" required placeholder={dim === "massa" ? "Peso medido" : "Quantidade medida"} aria-label="Quantidade medida" />
                  <Selecao name="unidade" defaultValue={unidades[0].codigo} aria-label="Unidade">
                    {unidades.map((u) => <option key={u.codigo} value={u.codigo}>{u.nome}</option>)}
                  </Selecao>
                  <BotaoEnviar>Registrar</BotaoEnviar>
                </FormAcao>
              </div>
            )
          })}
        </CardContent>
      </Card>
      {comConferencia ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Conferências resolvidas</CardTitle>
              <CardDescription>Últimas 20, com a justificativa e o responsável.</CardDescription>
            </CardHeader>
            <CardContent><ConferenciasResolvidas lista={(resolvidas.data ?? []) as Conferencia[]} /></CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Limite de conferência</CardTitle>
              <CardDescription>Compra com alta acima deste percentual sobre o custo validado fica pendente para conferência em {s.casa.nome}. Nenhuma compra é rejeitada automaticamente.</CardDescription>
            </CardHeader>
            <CardContent>
              <LimitesConferencia limites={(limites.data ?? []) as Limite[]} categorias={opcoesCat}
                salvar={salvarLimite} remover={(id) => removerLimite.bind(null, id)} />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}

import type { Metadata } from "next"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { exigirCasa, podeVerCustos } from "@/lib/sessao"
import { categorias, nomesCategorias } from "@/lib/dados"
import { percentual, reais } from "@/lib/formato"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { precosDasFichas } from "./dados"
import { BuscaLista } from "@/components/busca-lista"
import { emAlerta, variacoesDasReceitas } from "@/lib/dados"
import { AvisoAlertas } from "@/components/aviso-alertas"
import { BadgeVariacao } from "@/components/variacao"

export const metadata: Metadata = { title: "Fichas técnicas" }

type Receita = {
  id: string; codigo: string; nome: string; categoria_id: string | null; ativo: boolean
  versoes_receita: { numero: number; status: "rascunho" | "aprovada" | "arquivada" }[]
}

// CMV acima disto aparece em vermelho
const CMV_ALERTA = 30

// Filtro por tipo, pela categoria da ficha (Fichas finais › …)
const GRUPOS = [
  { valor: "", rotulo: "Todas" },
  { valor: "drinks", rotulo: "Drinks" },
  { valor: "comida", rotulo: "Comida" },
  { valor: "bebidas", rotulo: "Bebidas" },
  { valor: "outros", rotulo: "Outros" },
] as const
const COMIDA = new Set(["Entradas", "Saladas", "Petiscos e porções", "Pratos principais", "Massas", "Risotos", "Pizzas", "Sanduíches e burgers",
  "Sushi, sashimi e temaki", "Pratos quentes orientais", "Acompanhamentos", "Sobremesas", "Menu infantil"])
const BEBIDAS = new Set(["Doses e garrafas", "Cafés e bebidas quentes"])
function grupoDa(categoria: string | undefined): string {
  const c = categoria?.split(" › ").at(-1) ?? ""
  return c.startsWith("Drinks") ? "drinks" : COMIDA.has(c) ? "comida" : BEBIDAS.has(c) ? "bebidas" : "outros"
}

export default async function Fichas({ searchParams }: { searchParams: Promise<{ ordem?: string; q?: string; tipo?: string; cardapio?: string; excluidas?: string }> }) {
  const s = await exigirCasa()
  const custos = podeVerCustos(s)
  const { ordem, q = "", tipo: tipoBruto = "", cardapio = "", excluidas = "" } = await searchParams
  const verExcluidas = excluidas === "sim"
  const tipo = GRUPOS.some((g) => g.valor === tipoBruto) ? tipoBruto : ""
  const termo = q.trim().replace(/[%,()]/g, " ")
  const supabase = await createClient()
  const [{ data }, cats] = await Promise.all([
    (termo
      ? supabase.from("receitas").select("id, codigo, nome, categoria_id, ativo, versoes_receita(numero, status)").eq("tipo", "final").or(`nome.ilike.%${termo}%,codigo.ilike.%${termo}%`).order("nome")
      : supabase.from("receitas").select("id, codigo, nome, categoria_id, ativo, versoes_receita(numero, status)").eq("tipo", "final").order("nome")),
    categorias("receita"),
  ])
  const nomes = nomesCategorias(cats)
  // fichas excluídas (ativo = false) só aparecem em "Ver excluídas"
  const lidasTodas = (data ?? []) as Receita[]
  const nExcluidas = lidasTodas.filter((r) => !r.ativo).length
  const lidas = lidasTodas.filter((r) => r.ativo !== verExcluidas)

  // Produção não busca custo nem preço
  const [precos, variacoes] = custos
    ? await Promise.all([precosDasFichas(s.casa.id), variacoesDasReceitas(s.casa.id, "final")])
    : [new Map(), new Map()]
  // "só no cardápio": esconde fichas sem item ativo no cardápio da casa
  const soCardapio = custos && cardapio === "sim" && !verExcluidas
  const todas = soCardapio ? lidas.filter((r) => precos.has(r.id)) : lidas
  const foraDoCardapio = custos ? lidas.filter((r) => !precos.has(r.id)).length : 0
  const grupo = new Map(todas.map((r) => [r.id, grupoDa(r.categoria_id ? nomes.get(r.categoria_id) : undefined)]))
  const conta = (g: string) => (g ? todas.filter((r) => grupo.get(r.id) === g).length : todas.length)
  const receitas = tipo ? todas.filter((r) => grupo.get(r.id) === tipo) : todas
  // links que mantêm busca, ordem, tipo e "só no cardápio"
  const href = (mudar: { ordem?: string; tipo?: string; cardapio?: string; excluidas?: string }) => {
    const p = new URLSearchParams()
    const o = mudar.ordem ?? (ordem === "cmv" ? "cmv" : "")
    const tp = mudar.tipo ?? tipo
    const cd = mudar.cardapio ?? (soCardapio ? "sim" : "")
    if (o) p.set("ordem", o)
    if (q) p.set("q", q)
    if (tp) p.set("tipo", tp)
    if (cd) p.set("cardapio", cd)
    if (mudar.excluidas ?? (verExcluidas ? "sim" : "")) p.set("excluidas", "sim")
    const qs = p.toString()
    return qs ? `/fichas?${qs}` : "/fichas"
  }
  const custoSemCardapio = new Map<string, number | null>()
  if (custos) {
    const fora = receitas.filter((r) => !precos.has(r.id))
    const res = await Promise.all(fora.map((r) => supabase.rpc("custo_receita", { p_receita: r.id, p_estab: s.casa.id })))
    fora.forEach((r, i) => custoSemCardapio.set(r.id, (res[i].data as number | null) ?? null))
  }
  if (custos && ordem === "cmv") {
    receitas.sort((a, b) => (precos.get(b.id)?.cmv ?? -1) - (precos.get(a.id)?.cmv ?? -1))
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Fichas técnicas</h1>
          <p className="text-sm text-muted-foreground">
            {custos ? `Custo pela versão vigente e preço do cardápio de ${s.casa.nome}` : "Fichas de produção"}
          </p>
        </div>
        {custos ? (
          <nav className="flex gap-1.5 text-sm" aria-label="Ordenar">
            <Link href={href({ ordem: "" })} className={cn("rounded-full border px-3 py-1.5", ordem !== "cmv" && "border-foreground bg-foreground text-background")}>Nome (A–Z)</Link>
            <Link href={href({ ordem: "cmv" })} className={cn("rounded-full border px-3 py-1.5", ordem === "cmv" && "border-foreground bg-foreground text-background")}>Maior CMV primeiro</Link>
          </nav>
        ) : null}
      </div>

      <AvisoAlertas quantidade={[...variacoes.values()].filter(emAlerta).length} um="ficha técnica subiu" varios="fichas técnicas subiram" ancora="fichas" />

      <BuscaLista q={q} placeholder="Buscar ficha por nome ou código" manter={ordem === "cmv" || tipo || soCardapio || verExcluidas
        ? { ...(ordem === "cmv" ? { ordem: "cmv" } : {}), ...(tipo ? { tipo } : {}), ...(soCardapio ? { cardapio: "sim" } : {}), ...(verExcluidas ? { excluidas: "sim" } : {}) } : undefined} />

      {verExcluidas ? (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <span><b>Fichas excluídas</b> · abra a ficha para restaurar.</span>
          <Link href={href({ excluidas: "", cardapio: "" })} className="underline">Voltar para as fichas</Link>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
      <nav aria-label="Filtrar por tipo" className="flex flex-wrap gap-1.5 text-sm">
        {GRUPOS.map((g) => (
          <Link key={g.valor} href={href({ tipo: g.valor })} aria-current={tipo === g.valor ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1.5", tipo === g.valor ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}>
            {g.rotulo} <span className="tabular-nums opacity-70">{conta(g.valor)}</span>
          </Link>
        ))}
      </nav>
      {custos && !verExcluidas ? (
        <Link href={href({ cardapio: soCardapio ? "" : "sim" })} role="switch" aria-checked={soCardapio}
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm hover:bg-muted">
          <span aria-hidden className={cn("relative h-4 w-7 rounded-full transition-colors", soCardapio ? "bg-foreground" : "bg-muted-foreground/30")}>
            <span className={cn("absolute top-0.5 size-3 rounded-full bg-background transition-all", soCardapio ? "left-3.5" : "left-0.5")} />
          </span>
          Ocultar fora do cardápio
          {foraDoCardapio ? <span className="tabular-nums text-muted-foreground">{foraDoCardapio}</span> : null}
        </Link>
      ) : null}
      </div>

      {receitas.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">{verExcluidas ? "Nenhuma ficha excluída." : q || tipo || soCardapio ? "Nenhuma ficha encontrada." : "Nenhuma ficha cadastrada."}</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {receitas.map((r) => {
            const vigente = r.versoes_receita.find((v) => v.status === "aprovada")
            const p = precos.get(r.id)
            const custo = p ? p.custo : custoSemCardapio.get(r.id)
            return (
              <li key={r.id}>
                <Link href={`/fichas/${r.id}`} className="grid gap-1 px-4 py-3 hover:bg-muted/50 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="font-medium">{r.nome}</div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{r.codigo}{r.categoria_id ? ` · ${nomes.get(r.categoria_id)}` : ""}</span>
                      {vigente ? <Badge variant="secondary">Versão {vigente.numero}</Badge> : <Badge variant="outline">Sem versão aprovada</Badge>}
                      {custos && !p ? <Badge variant="outline">Fora do cardápio</Badge> : null}
                    </div>
                  </div>
                  {custos ? (
                    <div className="grid gap-0.5 text-sm tabular-nums sm:justify-items-end">
                      <span className="inline-flex flex-wrap items-center gap-x-1.5 sm:justify-end">
                        Custo <b>{custo != null ? reais(custo) : "—"}</b>
                        {variacoes.get(r.id) ? <BadgeVariacao sinal={variacoes.get(r.id)!.sinal} pct={variacoes.get(r.id)!.variacao_pct} /> : null}
                        {p?.preco != null ? <> · Preço <b>{reais(p.preco)}</b></> : null}
                      </span>
                      {p?.cmv != null ? (
                        <span className={cn("text-xs", Number(p.cmv) > CMV_ALERTA ? "font-semibold text-alta" : "text-muted-foreground")}>
                          CMV {percentual(p.cmv)} · margem {reais(p.margem)}
                        </span>
                      ) : custo == null ? <span className="text-xs text-muted-foreground">Falta preço de algum insumo</span> : null}
                    </div>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {!verExcluidas && nExcluidas > 0 ? (
        <p className="text-sm text-muted-foreground">
          <Link href={href({ excluidas: "sim", cardapio: "" })} className="underline">Ver fichas excluídas ({nExcluidas})</Link>
        </p>
      ) : null}
    </div>
  )
}

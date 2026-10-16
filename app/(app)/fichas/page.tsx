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

export const metadata: Metadata = { title: "Fichas" }

type Receita = {
  id: string; codigo: string; nome: string; categoria_id: string | null
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

export default async function Fichas({ searchParams }: { searchParams: Promise<{ ordem?: string; q?: string; tipo?: string }> }) {
  const s = await exigirCasa()
  const custos = podeVerCustos(s)
  const { ordem, q = "", tipo: tipoBruto = "" } = await searchParams
  const tipo = GRUPOS.some((g) => g.valor === tipoBruto) ? tipoBruto : ""
  const termo = q.trim().replace(/[%,()]/g, " ")
  const supabase = await createClient()
  const [{ data }, cats] = await Promise.all([
    (termo
      ? supabase.from("receitas").select("id, codigo, nome, categoria_id, versoes_receita(numero, status)").eq("tipo", "final").or(`nome.ilike.%${termo}%,codigo.ilike.%${termo}%`).order("nome")
      : supabase.from("receitas").select("id, codigo, nome, categoria_id, versoes_receita(numero, status)").eq("tipo", "final").order("nome")),
    categorias("receita"),
  ])
  const nomes = nomesCategorias(cats)
  const todas = (data ?? []) as Receita[]
  const grupo = new Map(todas.map((r) => [r.id, grupoDa(r.categoria_id ? nomes.get(r.categoria_id) : undefined)]))
  const conta = (g: string) => (g ? todas.filter((r) => grupo.get(r.id) === g).length : todas.length)
  const receitas = tipo ? todas.filter((r) => grupo.get(r.id) === tipo) : todas
  // links que mantêm busca, ordem e tipo
  const href = (mudar: { ordem?: string; tipo?: string }) => {
    const p = new URLSearchParams()
    const o = mudar.ordem ?? (ordem === "cmv" ? "cmv" : "")
    const tp = mudar.tipo ?? tipo
    if (o) p.set("ordem", o)
    if (q) p.set("q", q)
    if (tp) p.set("tipo", tp)
    const qs = p.toString()
    return qs ? `/fichas?${qs}` : "/fichas"
  }

  // Produção não busca custo nem preço
  const [precos, variacoes] = custos
    ? await Promise.all([precosDasFichas(s.casa.id), variacoesDasReceitas(s.casa.id, "final")])
    : [new Map(), new Map()]
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

      <BuscaLista q={q} placeholder="Buscar ficha por nome ou código" manter={ordem === "cmv" || tipo ? { ...(ordem === "cmv" ? { ordem: "cmv" } : {}), ...(tipo ? { tipo } : {}) } : undefined} />

      <nav aria-label="Filtrar por tipo" className="flex flex-wrap gap-1.5 text-sm">
        {GRUPOS.map((g) => (
          <Link key={g.valor} href={href({ tipo: g.valor })} aria-current={tipo === g.valor ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1.5", tipo === g.valor ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}>
            {g.rotulo} <span className="tabular-nums opacity-70">{conta(g.valor)}</span>
          </Link>
        ))}
      </nav>

      {receitas.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">{q || tipo ? "Nenhuma ficha encontrada." : "Nenhuma ficha cadastrada."}</p>
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
                        <span className={cn("text-xs", Number(p.cmv) > CMV_ALERTA ? "font-semibold text-red-700 dark:text-red-400" : "text-muted-foreground")}>
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
    </div>
  )
}

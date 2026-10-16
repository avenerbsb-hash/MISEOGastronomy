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

export default async function Fichas({ searchParams }: { searchParams: Promise<{ ordem?: string; q?: string }> }) {
  const s = await exigirCasa()
  const custos = podeVerCustos(s)
  const { ordem, q = "" } = await searchParams
  const termo = q.trim().replace(/[%,()]/g, " ")
  const supabase = await createClient()
  const [{ data }, cats] = await Promise.all([
    (termo
      ? supabase.from("receitas").select("id, codigo, nome, categoria_id, versoes_receita(numero, status)").eq("tipo", "final").or(`nome.ilike.%${termo}%,codigo.ilike.%${termo}%`).order("nome")
      : supabase.from("receitas").select("id, codigo, nome, categoria_id, versoes_receita(numero, status)").eq("tipo", "final").order("nome")),
    categorias("receita"),
  ])
  const nomes = nomesCategorias(cats)
  const receitas = (data ?? []) as Receita[]

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
            <Link href={q ? `/fichas?q=${encodeURIComponent(q)}` : "/fichas"} className={cn("rounded-full border px-3 py-1.5", ordem !== "cmv" && "border-foreground bg-foreground text-background")}>Nome (A–Z)</Link>
            <Link href={`/fichas?ordem=cmv${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={cn("rounded-full border px-3 py-1.5", ordem === "cmv" && "border-foreground bg-foreground text-background")}>Maior CMV primeiro</Link>
          </nav>
        ) : null}
      </div>

      <AvisoAlertas quantidade={[...variacoes.values()].filter(emAlerta).length} um="ficha técnica subiu" varios="fichas técnicas subiram" ancora="fichas" />

      <BuscaLista q={q} placeholder="Buscar ficha por nome ou código" manter={ordem === "cmv" ? { ordem: "cmv" } : undefined} />

      {receitas.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">{q ? "Nenhuma ficha encontrada." : "Nenhuma ficha cadastrada."}</p>
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

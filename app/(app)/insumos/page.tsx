import type { Metadata } from "next"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { categorias, nomesCategorias, variacoesDaCasa, type Insumo, type VariacaoInsumo } from "@/lib/dados"
import { custoPorUnidade } from "@/lib/formato"
import { Variacao } from "@/components/variacao"
import { Entrada, Selecao } from "@/components/campos"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Insumos" }

// Situação do custo de cada insumo na casa (vem de variacoes_insumos)
type Situacao = "subiu" | "caiu" | "estavel" | "sem_comparacao" | "sem_preco"
function situacao(v: VariacaoInsumo | undefined): Situacao {
  if (!v) return "sem_preco"
  if (v.sinal === "vermelho") return "subiu"
  if (v.sinal === "verde") return "caiu"
  return v.custo_anterior == null ? "sem_comparacao" : "estavel"
}

const FILTROS: { valor: "" | Situacao; rotulo: string }[] = [
  { valor: "", rotulo: "Todos" },
  { valor: "subiu", rotulo: "▲ Subiram" },
  { valor: "caiu", rotulo: "▼ Caíram" },
  { valor: "estavel", rotulo: "= Estáveis" },
  { valor: "sem_comparacao", rotulo: "Sem comparação" },
  { valor: "sem_preco", rotulo: "Sem preço" },
]

const ORDENS = {
  nome: "Nome (A–Z)",
  alta: "Maior alta primeiro",
  queda: "Maior queda primeiro",
} as const
type Ordem = keyof typeof ORDENS

type Params = { q?: string; categoria?: string; variacao?: string; ordem?: string }

export default async function PaginaInsumos({ searchParams }: { searchParams: Promise<Params> }) {
  const s = await exigirCustos()
  const params = await searchParams
  const { q = "", categoria = "" } = params
  const filtro = FILTROS.some((f) => f.valor === params.variacao) ? (params.variacao as Situacao) : ""
  const ordem: Ordem = params.ordem && params.ordem in ORDENS ? (params.ordem as Ordem) : "nome"
  const supabase = await createClient()

  const cats = await categorias("insumo")
  const nomes = nomesCategorias(cats)

  let consulta = supabase
    .from("insumos")
    .select("id, codigo, nome, dimensao, categoria_id, ativo")
    .order("nome")
  if (q.trim()) {
    const termo = q.trim().replace(/[%,()]/g, " ")
    consulta = consulta.or(`nome.ilike.%${termo}%,codigo.ilike.%${termo}%`)
  }
  if (categoria) {
    // Categoria-mãe inclui as subcategorias
    const ids = [categoria, ...cats.filter((c) => c.pai_id === categoria).map((c) => c.id)]
    consulta = consulta.in("categoria_id", ids)
  }
  const [{ data, error }, variacoes] = await Promise.all([consulta, variacoesDaCasa(s.casa.id)])
  const todos = (data ?? []) as Pick<Insumo, "id" | "codigo" | "nome" | "dimensao" | "categoria_id" | "ativo">[]

  // Contagem por situação (respeita busca e categoria) e filtro escolhido
  const contagem = new Map<string, number>([["", todos.length]])
  for (const i of todos) {
    const k = situacao(variacoes.get(i.id))
    contagem.set(k, (contagem.get(k) ?? 0) + 1)
  }
  const insumos = filtro ? todos.filter((i) => situacao(variacoes.get(i.id)) === filtro) : [...todos]

  // Ordenação pela variação que o banco calculou; sem variação vai para o fim
  if (ordem !== "nome") {
    const sentido = ordem === "alta" ? -1 : 1
    insumos.sort((a, b) => {
      const va = variacoes.get(a.id)?.variacao_pct
      const vb = variacoes.get(b.id)?.variacao_pct
      if (va == null && vb == null) return a.nome.localeCompare(b.nome, "pt-BR")
      if (va == null) return 1
      if (vb == null) return -1
      return sentido * (Number(va) - Number(vb)) || a.nome.localeCompare(b.nome, "pt-BR")
    })
  }

  const link = (mudar: Partial<Params>) => {
    const p = new URLSearchParams()
    const final = { q, categoria, variacao: filtro, ordem: ordem === "nome" ? "" : ordem, ...mudar }
    for (const [k, v] of Object.entries(final)) if (v) p.set(k, v)
    const qs = p.toString()
    return qs ? `/insumos?${qs}` : "/insumos"
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Insumos</h1>
          <p className="text-sm text-muted-foreground">Custo da última compra validada em {s.casa.nome}</p>
        </div>
        <Link href="/insumos/novo" className={buttonVariants({ className: "h-10 px-4" })}>Novo insumo</Link>
      </div>

      <form className="grid gap-2 sm:grid-cols-[1fr_16rem_14rem_auto]" role="search">
        <Entrada name="q" defaultValue={q} placeholder="Buscar por nome ou código" aria-label="Buscar" />
        <Selecao name="categoria" defaultValue={categoria} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{nomes.get(c.id)}</option>
          ))}
        </Selecao>
        <Selecao name="ordem" defaultValue={ordem} aria-label="Ordenar por">
          {(Object.keys(ORDENS) as Ordem[]).map((o) => (
            <option key={o} value={o}>Ordenar: {ORDENS[o]}</option>
          ))}
        </Selecao>
        {filtro ? <input type="hidden" name="variacao" value={filtro} /> : null}
        <Button type="submit" variant="outline" className="h-10 px-4">Aplicar</Button>
      </form>

      <nav aria-label="Filtrar por variação de custo" className="-mt-1 flex flex-wrap gap-1.5">
        {FILTROS.map((f) => {
          const ativo = filtro === f.valor
          const n = contagem.get(f.valor) ?? 0
          return (
            <Link
              key={f.valor || "todos"}
              href={link({ variacao: f.valor })}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
                ativo ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                !ativo && f.valor === "subiu" && "text-red-700 dark:text-red-400",
                !ativo && f.valor === "caiu" && "text-emerald-700 dark:text-emerald-400",
              )}
            >
              {f.rotulo}
              <span className={cn("tabular-nums text-xs", ativo ? "opacity-80" : "text-muted-foreground")}>{n}</span>
            </Link>
          )
        })}
      </nav>

      {error ? <p className="text-sm text-destructive">Não foi possível carregar os insumos.</p> : null}
      {insumos.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">Nenhum insumo encontrado.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {insumos.map((i) => {
            const v = variacoes.get(i.id)
            return (
              <li key={i.id}>
                <Link href={`/insumos/${i.id}`} className="grid gap-1 px-4 py-3 hover:bg-muted/50 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {i.nome} {!i.ativo && <span className="text-xs font-normal text-muted-foreground">(inativo)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {i.codigo}{i.categoria_id ? ` · ${nomes.get(i.categoria_id)}` : ""}
                    </div>
                  </div>
                  <div className="grid gap-0.5 sm:justify-items-end">
                    <span className="font-medium tabular-nums">
                      {v ? custoPorUnidade(v.custo_atual, i.dimensao) : <span className="text-sm font-normal text-muted-foreground">Sem preço nesta casa</span>}
                    </span>
                    {v ? <Variacao sinal={v.sinal} pct={v.variacao_pct} data={v.data_referencia} casa={s.casa.nome} /> : null}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { exigirProducao, podeVerCustos } from "@/lib/sessao"
import { dataHora, numero, percentual, reais, rotuloUnidade } from "@/lib/formato"
import { agruparPorEtapa, type LinhaProducao } from "@/components/ficha-producao"
import { TabelaCustos, type LinhaGerencial } from "@/components/tabela-custos"
import { BotaoImprimir } from "@/components/botao-imprimir"
import { LogoCasa } from "@/components/logo-casa"
import { cn } from "@/lib/utils"
import { precosDasFichas } from "../../dados"

// PDF da ficha: "preparo" (sem R$, para a cozinha/bar) ou "custos" (gestão: custo, preço e CMV)
export default async function PdfFicha({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ modo?: string }> }) {
  const s = await exigirProducao()
  const { id } = await params
  const custos = podeVerCustos(s)
  const modo = custos && (await searchParams).modo !== "preparo" ? "custos" : "preparo"
  const supabase = await createClient()

  const [{ data: receita }, { data: producao }] = await Promise.all([
    supabase.from("receitas").select("codigo, nome").eq("id", id).maybeSingle(),
    supabase.from("vw_ficha_producao").select("*").eq("receita_id", id).order("ordem"),
  ])
  const linhas = (producao ?? []) as LinhaProducao[]
  if (!receita || !linhas.length) {
    return <p className="text-sm text-muted-foreground">Esta ficha ainda não tem versão aprovada, então não há PDF.</p>
  }

  // Custos só são buscados no modo gestão (produção nunca chega aqui)
  let custo: number | null = null
  let gerencial: LinhaGerencial[] = []
  let preco: { preco: number | null; cmv: number | null; margem: number | null } | undefined
  let meta = 30
  if (modo === "custos") {
    const [c, g, precos, casa] = await Promise.all([
      supabase.rpc("custo_receita", { p_receita: id, p_estab: s.casa.id }),
      supabase.rpc("ficha_gerencial", { p_receita: id, p_estab: s.casa.id }),
      precosDasFichas(s.casa.id),
      supabase.from("estabelecimentos").select("cmv_alvo_padrao").eq("id", s.casa.id).maybeSingle(),
    ])
    custo = (c.data as number | null) ?? null
    gerencial = (g.data ?? []) as LinhaGerencial[]
    preco = precos.get(id)
    meta = Number(casa.data?.cmv_alvo_padrao ?? 30)
  }

  const v = linhas[0]
  const componentes = linhas.filter((l) => l.componente)
  const alergenos = [...new Set(componentes.flatMap((l) => l.alergenos ?? []))]

  return (
    <div className="grid gap-4">
      {/* opções na tela (não saem no PDF) */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        {custos ? (
          <div className="flex gap-1 rounded-lg border p-1 text-sm">
            <Link href={`/fichas/${id}/pdf`} className={cn("rounded-md px-3 py-1.5", modo === "custos" ? "bg-foreground text-background" : "hover:bg-muted")}>Com custos e CMV</Link>
            <Link href={`/fichas/${id}/pdf?modo=preparo`} className={cn("rounded-md px-3 py-1.5", modo === "preparo" ? "bg-foreground text-background" : "hover:bg-muted")}>Só preparo (sem R$)</Link>
          </div>
        ) : <span />}
        <BotaoImprimir>Emitir PDF</BotaoImprimir>
      </div>
      <p className="text-xs text-muted-foreground print:hidden">
        Na janela que abrir, escolha <b>Salvar como PDF</b> (ou a impressora). Abaixo, a prévia da folha.
      </p>

      {/* folha */}
      <article className="grid gap-4 rounded-xl border bg-background p-5 print:gap-3 print:rounded-none print:border-0 print:p-0 print:text-[11px]">
        <header className="flex items-start justify-between gap-3 border-b pb-3">
          <div className="flex items-center gap-3">
            <LogoCasa url={s.casa.logo} nome={s.casa.nome} className="h-14" />
            <div>
              <h1 className="text-xl font-semibold">{receita.nome}</h1>
              <p className="text-sm text-muted-foreground">
                {receita.codigo} · {s.casa.nome} · {modo === "custos" ? "Ficha técnica gerencial" : "Ficha técnica de preparo"}
              </p>
            </div>
          </div>
          <span className="whitespace-nowrap text-xs text-muted-foreground">MISEO · {dataHora(new Date().toISOString())}</span>
        </header>

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-muted-foreground">Versão</dt><dd className="font-medium">{v.versao}</dd></div>
          <div><dt className="text-muted-foreground">Rendimento</dt><dd className="font-medium">{numero(v.rendimento_quantidade)} {rotuloUnidade(v.rendimento_unidade)}</dd></div>
          <div><dt className="text-muted-foreground">Porção</dt><dd className="font-medium">{v.porcao_descricao ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Validade</dt><dd className="font-medium">{v.validade_horas ? `${v.validade_horas} h` : "—"}</dd></div>
        </dl>

        {modo === "custos" ? (
          <>
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-5">
              <div><dt className="text-muted-foreground">Custo da porção</dt><dd className="text-lg font-semibold tabular-nums">{custo != null ? reais(custo) : "falta preço"}</dd></div>
              <div><dt className="text-muted-foreground">Preço no cardápio</dt><dd className="text-lg tabular-nums">{preco?.preco != null ? reais(preco.preco) : "—"}</dd></div>
              <div>
                <dt className="text-muted-foreground">CMV</dt>
                <dd className={cn("text-lg tabular-nums", preco?.cmv == null ? "" : Number(preco.cmv) > meta ? "font-semibold text-alta" : "text-queda")}>{preco?.cmv != null ? percentual(preco.cmv) : "—"}</dd>
              </div>
              <div><dt className="text-muted-foreground">Meta de CMV</dt><dd className="text-lg tabular-nums">{percentual(meta)}</dd></div>
              <div><dt className="text-muted-foreground">Saldo após ingredientes</dt><dd className="text-lg tabular-nums">{preco?.margem != null ? reais(preco.margem) : "—"}</dd></div>
            </dl>
            <TabelaCustos linhas={gerencial} />
            <p className="text-xs text-muted-foreground">Custos com o último preço validado de cada insumo em {s.casa.nome}.</p>
          </>
        ) : (
          agruparPorEtapa(componentes).map(([etapa, itens]) => (
            <section key={etapa} className="rounded-xl border print:break-inside-avoid">
              <h3 className="border-b px-4 py-2 text-sm font-semibold capitalize">{etapa}</h3>
              <ul className="divide-y">
                {itens.map((c, i) => (
                  <li key={i} className="flex justify-between gap-3 px-4 py-2 text-sm">
                    <span>
                      {c.componente}
                      {c.tipo_componente === "subproduto" ? <span className="text-xs text-muted-foreground"> (subproduto)</span> : null}
                      {c.observacao ? <span className="block text-xs text-muted-foreground">{c.observacao}</span> : null}
                    </span>
                    <span className="whitespace-nowrap font-medium tabular-nums">{numero(c.quantidade)} {rotuloUnidade(c.unidade ?? "")}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        {alergenos.length ? <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800">Alergênicos: {alergenos.join(", ")}</p> : null}

        {v.modo_preparo ? (
          <section className="print:break-inside-avoid">
            <h3 className="mb-1 text-sm font-semibold">Modo de preparo</h3>
            <p className="whitespace-pre-line text-sm">{v.modo_preparo}</p>
          </section>
        ) : null}
        {v.apresentacao ? (
          <section className="print:break-inside-avoid">
            <h3 className="mb-1 text-sm font-semibold">Apresentação</h3>
            <p className="whitespace-pre-line text-sm">{v.apresentacao}</p>
          </section>
        ) : null}
      </article>
    </div>
  )
}

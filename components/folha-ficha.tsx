import { numero, percentual, reais, rotuloUnidade } from "@/lib/formato"
import { agruparPorEtapa, type LinhaProducao } from "@/components/ficha-producao"
import { TabelaCustos, type LinhaGerencial } from "@/components/tabela-custos"
import { LogoCasa } from "@/components/logo-casa"
import { cn } from "@/lib/utils"

// Custos da folha (só no modo gestão; produção nunca recebe isto)
export type CustosFolha = {
  custo: number | null
  linhas: LinhaGerencial[]
  preco: { preco: number | null; cmv: number | null; margem: number | null } | undefined
  meta: number
}

// Uma folha A4 de ficha técnica: preparo (sem R$) ou gestão (com custos e CMV)
export function FolhaFicha({ nome, codigo, casa, emitido, linhas, custos, className }: {
  nome: string; codigo: string; casa: { nome: string; logo?: string | null }; emitido: string
  linhas: LinhaProducao[]; custos?: CustosFolha; className?: string
}) {
  const v = linhas[0]
  const componentes = linhas.filter((l) => l.componente)
  const alergenos = [...new Set(componentes.flatMap((l) => l.alergenos ?? []))]
  const p = custos?.preco

  return (
    <article className={cn("grid gap-4 rounded-xl border bg-background p-5 print:gap-3 print:rounded-none print:border-0 print:p-0 print:text-[11px]", className)}>
      <header className="flex items-start justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-3">
          <LogoCasa url={casa.logo} nome={casa.nome} className="h-14" />
          <div>
            <h2 className="text-xl font-semibold">{nome}</h2>
            <p className="text-sm text-muted-foreground">
              {codigo} · {casa.nome} · {custos ? "Ficha técnica gerencial" : "Ficha técnica de preparo"}
            </p>
          </div>
        </div>
        <span className="whitespace-nowrap text-xs text-muted-foreground">MISEO · {emitido}</span>
      </header>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-muted-foreground">Versão</dt><dd className="font-medium">{v.versao}</dd></div>
        <div><dt className="text-muted-foreground">Rendimento</dt><dd className="font-medium">{numero(v.rendimento_quantidade)} {rotuloUnidade(v.rendimento_unidade)}</dd></div>
        <div><dt className="text-muted-foreground">Porção</dt><dd className="font-medium">{v.porcao_descricao ?? "—"}</dd></div>
        <div><dt className="text-muted-foreground">Validade</dt><dd className="font-medium">{v.validade_horas ? `${v.validade_horas} h` : "—"}</dd></div>
      </dl>

      {custos ? (
        <>
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-5">
            <div><dt className="text-muted-foreground">Custo da porção</dt><dd className="text-lg font-semibold tabular-nums">{custos.custo != null ? reais(custos.custo) : "falta preço"}</dd></div>
            <div><dt className="text-muted-foreground">Preço no cardápio</dt><dd className="text-lg tabular-nums">{p?.preco != null ? reais(p.preco) : "—"}</dd></div>
            <div>
              <dt className="text-muted-foreground">CMV</dt>
              <dd className={cn("text-lg tabular-nums", p?.cmv == null ? "" : Number(p.cmv) > custos.meta ? "font-semibold text-alta" : "text-queda")}>{p?.cmv != null ? percentual(p.cmv) : "—"}</dd>
            </div>
            <div><dt className="text-muted-foreground">Meta de CMV</dt><dd className="text-lg tabular-nums">{percentual(custos.meta)}</dd></div>
            <div><dt className="text-muted-foreground">Saldo após ingredientes</dt><dd className="text-lg tabular-nums">{p?.margem != null ? reais(p.margem) : "—"}</dd></div>
          </dl>
          <TabelaCustos linhas={custos.linhas} />
          <p className="text-xs text-muted-foreground">Custos com o último preço validado de cada insumo em {casa.nome}.</p>
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
  )
}

import { numero, rotuloUnidade } from "@/lib/formato"

// Linha da view vw_ficha_producao (sem nenhum valor financeiro)
export type LinhaProducao = {
  versao: number
  rendimento_quantidade: number
  rendimento_unidade: string
  porcao_descricao: string | null
  modo_preparo: string | null
  apresentacao: string | null
  validade_horas: number | null
  ordem: number | null
  etapa: string | null
  componente: string | null
  tipo_componente: string | null
  quantidade: number | null
  unidade: string | null
  observacao: string | null
  alergenos: string[] | null
}

export function agruparPorEtapa<T extends { etapa: string | null }>(linhas: T[]): [string, T[]][] {
  const grupos = new Map<string, T[]>()
  for (const l of linhas) {
    const k = l.etapa?.trim() || "Preparo"
    grupos.set(k, [...(grupos.get(k) ?? []), l])
  }
  return [...grupos.entries()]
}

export function FichaProducao({ linhas }: { linhas: LinhaProducao[] }) {
  if (!linhas.length) return <p className="text-sm text-muted-foreground">Este subproduto ainda não tem versão aprovada.</p>
  const v = linhas[0]
  const componentes = linhas.filter((l) => l.componente)
  const alergenos = [...new Set(componentes.flatMap((l) => l.alergenos ?? []))]
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-2 gap-3 rounded-xl border p-4 text-sm sm:grid-cols-4">
        <div><dt className="text-muted-foreground">Versão</dt><dd className="font-medium">{v.versao}</dd></div>
        <div><dt className="text-muted-foreground">Rendimento</dt><dd className="font-medium">{numero(v.rendimento_quantidade)} {rotuloUnidade(v.rendimento_unidade)}</dd></div>
        <div><dt className="text-muted-foreground">Porção</dt><dd className="font-medium">{v.porcao_descricao ?? "—"}</dd></div>
        <div><dt className="text-muted-foreground">Validade</dt><dd className="font-medium">{v.validade_horas ? `${v.validade_horas} h` : "—"}</dd></div>
      </dl>

      {agruparPorEtapa(componentes).map(([etapa, itens]) => (
        <section key={etapa} className="rounded-xl border">
          <h3 className="border-b px-4 py-2 text-sm font-semibold capitalize">{etapa}</h3>
          <ul className="divide-y">
            {itens.map((c, i) => (
              <li key={i} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
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
      ))}

      {alergenos.length ? (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          Alergênicos: {alergenos.join(", ")}
        </p>
      ) : null}

      {v.modo_preparo ? (
        <section className="rounded-xl border p-4">
          <h3 className="mb-2 text-sm font-semibold">Modo de preparo</h3>
          <p className="whitespace-pre-line text-sm">{v.modo_preparo}</p>
        </section>
      ) : null}
    </div>
  )
}

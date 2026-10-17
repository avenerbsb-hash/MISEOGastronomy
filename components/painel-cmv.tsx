import Link from "next/link"
import { dataHora, percentual, reais } from "@/lib/formato"
import { CORES_STATUS, COR_TODOS } from "@/components/status-preco"
import { cn } from "@/lib/utils"
import { BotaoImprimir } from "@/components/botao-imprimir"
import { SeloIndicador } from "@/components/indicador-preco"

// Painel de CMV da casa: só exibe o que painel_cmv_casa / cmv_da_casa calcularam no banco
export type LinhaCmv = {
  item_id: string; receita_id: string; cardapio: string; produto: string
  custo_porcao: number | null; preco_publicado: number | null; cmv_atual_pct: number | null; margem_atual: number | null
  cmv_ref_pct: number | null; preco_manter_cmv: number | null; preco_manter_margem: number | null
  meta_pct: number; meta_definida: boolean
  preco_meta: number | null; cmv_preco_meta_pct: number | null; ajuste_meta_pct: number | null
  situacao: "acima_da_meta" | "dentro_da_meta" | "sem_preco" | "sem_custo"
}

export const FILTROS_CMV = [
  { valor: "", rotulo: "Todos" },
  { valor: "acima_da_meta", rotulo: "▲ Acima da meta" },
  { valor: "dentro_da_meta", rotulo: "Dentro da meta" },
  { valor: "sem_preco", rotulo: "Sem preço" },
  { valor: "sem_custo", rotulo: "Sem custo" },
  { valor: "desativados", rotulo: "Desativados" },
] as const

// Item desativado do cardápio (fora do painel e do CMV médio)
export type ItemDesativado = { item_id: string; receita_id: string; produto: string; cardapio: string }

// Resultado na ponta do item (resultado_itens_casa, 0013)
export type ResultadoItem = {
  item_id: string; resultado: number | null; resultado_pct: number | null; lucro_alvo_pct: number
  preco_ideal_arredondado: number | null; cmv_preco_ideal_pct: number | null; situacao: "ok" | "abaixo_do_alvo" | "prejuizo" | "sem_dados"
}

// Custo atual × custo pela média das últimas notas de cada insumo (custo_vs_media_casa, 0017)
export type CustoMedia = { item_id: string; custo_media: number | null; variacao_pct: number | null; status: "subiu" | "caiu" | "estavel" | "sem_comparacao" }
export const NOTAS_MEDIA = 10

// Bloco do item no cardápio (seção como no cardápio impresso); ordem = posição no cardápio
export type BlocoItem = { bloco: string; ordem: number }

export function PainelCmv({
  linhas, filtro, media, meta, metaDefinida, casa, formMeta, desativados = [], botaoItem, blocos, agrupado = false, moverItem, resultados, estrutura, bloco = "", medias,
}: {
  linhas: LinhaCmv[]; filtro: string; media: number | null; meta: number; metaDefinida: boolean; casa: string
  formMeta?: React.ReactNode
  desativados?: ItemDesativado[]
  // botão Ativar/Desativar (formulário com a ação do servidor), montado pela página
  botaoItem?: (itemId: string, ativar: boolean) => React.ReactNode
  // seção de cada item (item_id → bloco); com "agrupado", a tabela sai em blocos como no cardápio
  blocos?: Map<string, BlocoItem>
  agrupado?: boolean
  // controle "Mover" (trocar a seção do item), montado pela página
  moverItem?: (itemId: string) => React.ReactNode
  // resultado na ponta por item; sem a migração 0013, a coluna mostra a margem bruta
  resultados?: Map<string, ResultadoItem>
  // quadro da estrutura de custos (abaixo dos indicadores)
  estrutura?: React.ReactNode
  // variação do custo contra a média das últimas notas; sem a migração 0017, a coluna mostra só o custo
  medias?: Map<string, CustoMedia>
  // seção aberta sozinha (vazio = todo o cardápio)
  bloco?: string
}) {
  const conta = (s: string) => (s === "desativados" ? desativados.length : linhas.filter((l) => !s || l.situacao === s).length)
  const visiveis = linhas.filter((l) => !filtro || l.situacao === filtro)
  const acima = conta("acima_da_meta")
  const href = (mudar: { situacao?: string; ver?: string; bloco?: string }) => {
    const p = new URLSearchParams()
    const situacao = mudar.situacao ?? filtro
    const ver = mudar.ver ?? (agrupado ? "" : "lista")
    // a lista única não separa por seção
    const b = ver === "lista" ? "" : mudar.bloco ?? bloco
    if (situacao) p.set("situacao", situacao)
    if (ver) p.set("ver", ver)
    if (b) p.set("bloco", b)
    const qs = p.toString()
    return qs ? `/cmv?${qs}` : "/cmv"
  }
  // blocos na ordem do cardápio; dentro de cada bloco, a ordem do painel (CMV mais alto primeiro)
  const grupos: { nome: string; ordem: number; itens: LinhaCmv[] }[] = []
  if (agrupado) {
    const porNome = new Map<string, { nome: string; ordem: number; itens: LinhaCmv[] }>()
    for (const l of visiveis) {
      const b = blocos?.get(l.item_id) ?? { bloco: l.cardapio, ordem: Number.MAX_SAFE_INTEGER }
      const g = porNome.get(b.bloco) ?? { nome: b.bloco, ordem: b.ordem, itens: [] }
      g.ordem = Math.min(g.ordem, b.ordem)
      g.itens.push(l)
      porNome.set(b.bloco, g)
    }
    grupos.push(...[...porNome.values()].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR")))
  }
  const linha = (l: LinhaCmv) => {
    const acimaMeta = l.situacao === "acima_da_meta"
    const m = medias?.get(l.item_id)
    return (
      <tr key={l.item_id} className="align-top break-inside-avoid">
        <td className="px-3 py-2 print:px-1.5 print:py-1">
          <Link href={`/fichas/${l.receita_id}`} className="font-medium hover:underline">{l.produto}</Link>
          {agrupado ? null : <div className="text-xs text-muted-foreground">{l.cardapio}</div>}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right print:px-1.5 print:py-1 tabular-nums">
          {l.custo_porcao != null ? reais(l.custo_porcao) : <span className="text-xs text-muted-foreground">falta preço de insumo</span>}
          {l.custo_porcao != null && m && m.status !== "sem_comparacao" ? (
            <div className="mt-1">
              <SeloIndicador status={m.status} pct={m.variacao_pct}
                titulo={`Custo atual contra o custo pela média das últimas ${NOTAS_MEDIA} notas de cada insumo (${reais(m.custo_media)})`} />
            </div>
          ) : null}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right print:px-1.5 print:py-1 tabular-nums">{reais(l.preco_publicado)}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right print:px-1.5 print:py-1">
          {l.cmv_atual_pct != null ? (
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
              style={acimaMeta ? { color: CORES_STATUS.subiu.texto, backgroundColor: CORES_STATUS.subiu.fundo } : { color: CORES_STATUS.caiu.texto, backgroundColor: CORES_STATUS.caiu.fundo }}>
              {percentual(l.cmv_atual_pct)}
            </span>
          ) : "—"}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right print:px-1.5 print:py-1 tabular-nums">
          {resultados ? <Resultado r={resultados.get(l.item_id)} /> : reais(l.margem_atual)}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right print:px-1.5 print:py-1 tabular-nums">
          {l.preco_meta != null ? (
            <>
              <b className={acimaMeta || l.situacao === "sem_preco" ? undefined : "font-normal text-muted-foreground"}>{reais(l.preco_meta)}</b>
              <div className="text-xs text-muted-foreground">
                CMV {percentual(l.cmv_preco_meta_pct)}{l.ajuste_meta_pct != null && acimaMeta ? ` · ${percentual(l.ajuste_meta_pct, true)}` : ""}
              </div>
            </>
          ) : "—"}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right print:px-1.5 print:py-1 tabular-nums">
          {l.preco_manter_cmv != null ? (
            <>
              {reais(l.preco_manter_cmv)}
              <div className="text-xs text-muted-foreground">CMV {percentual(l.cmv_ref_pct)}</div>
            </>
          ) : "—"}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right print:px-1.5 print:py-1 print:hidden">
          <div className="flex items-center justify-end gap-1">
            <Link href={`/fichas/${l.receita_id}/preco`} className="text-sm font-medium underline">
              {l.preco_publicado == null ? "Definir preço" : "Ajustar preço"}
            </Link>
            {botaoItem?.(l.item_id, false)}
          </div>
          {moverItem?.(l.item_id)}
        </td>
      </tr>
    )
  }
  const ancora = (nome: string) => "bloco-" + nome.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase()
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Painel de CMV</h1>
          <p className="text-sm text-muted-foreground">
            Cardápio de {casa}, {agrupado ? "em blocos como no cardápio" : "do CMV mais alto para o mais baixo"}, com o preço sugerido para a meta
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 print:hidden">
        <nav aria-label="Organização" className="flex gap-1.5 text-sm">
          <Link href={href({ ver: "" })} className={cn("rounded-full border px-3 py-1.5", agrupado && "border-foreground bg-foreground text-background")}>Por seção do cardápio</Link>
          <Link href={href({ ver: "lista" })} className={cn("rounded-full border px-3 py-1.5", !agrupado && "border-foreground bg-foreground text-background")}>Lista por CMV</Link>
        </nav>
        <BotaoImprimir>Emitir PDF</BotaoImprimir>
        </div>
        <p className="hidden w-full text-xs text-muted-foreground print:block">
          MISEO · {casa} · gerado em {dataHora(new Date().toISOString())}
          {" · "}{FILTROS_CMV.find((f) => f.valor === filtro)?.rotulo.replace("▲ ", "") ?? "Todos"}
          {agrupado && bloco ? ` · seção ${bloco}` : agrupado ? " · todo o cardápio" : ""}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 print:grid-cols-3">
        <div className="rounded-xl border px-4 py-3">
          <div className={cn("text-2xl font-semibold tabular-nums", media != null && media > meta && "text-[#EC001C]")}>{percentual(media)}</div>
          <div className="text-sm text-muted-foreground">CMV médio do cardápio</div>
        </div>
        <div className="rounded-xl border px-4 py-3">
          <div className="text-2xl font-semibold tabular-nums">{percentual(meta)}</div>
          <div className="text-sm text-muted-foreground">Meta de CMV da casa{metaDefinida ? "" : " (padrão)"}</div>
          {formMeta}
        </div>
        <Link href={href({ situacao: "acima_da_meta" })} className="rounded-xl border px-4 py-3 hover:bg-muted/50">
          <div className={cn("text-2xl font-semibold tabular-nums", acima > 0 && "text-[#EC001C]")}>{acima}</div>
          <div className="text-sm text-muted-foreground">{acima === 1 ? "item acima da meta" : "itens acima da meta"}</div>
        </Link>
      </div>

      {estrutura}

      <nav aria-label="Filtrar por situação" className="flex flex-wrap gap-1.5 print:hidden">
        {FILTROS_CMV.map((f) => {
          const ativo = filtro === f.valor
          const cor = f.valor === "acima_da_meta" ? CORES_STATUS.subiu : f.valor === "dentro_da_meta" ? CORES_STATUS.caiu
            : f.valor === "sem_preco" ? CORES_STATUS.sem_preco : f.valor === "sem_custo" ? CORES_STATUS.sem_comparacao
            : f.valor === "desativados" ? CORES_STATUS.estavel : null
          return (
            <Link key={f.valor} href={href({ situacao: f.valor })} aria-current={ativo ? "page" : undefined}
              className={cn("rounded-full border px-3 py-1.5 text-sm", ativo && "border-transparent font-semibold")}
              style={ativo ? (cor ? { color: cor.texto, backgroundColor: cor.fundo } : { color: COR_TODOS.texto, backgroundColor: COR_TODOS.fundo }) : undefined}>
              {f.rotulo} <span className="tabular-nums opacity-70">{conta(f.valor)}</span>
            </Link>
          )
        })}
      </nav>

      {filtro === "desativados" ? (
        desativados.length === 0 ? (
          <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">Nenhum item desativado. Use “Desativar” na linha do item para tirá-lo do cardápio.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {desativados.map((d) => (
              <li key={d.item_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <Link href={`/fichas/${d.receita_id}`} className="font-medium hover:underline">{d.produto}</Link>
                  <div className="text-xs text-muted-foreground">{d.cardapio} · desativado</div>
                </div>
                {botaoItem?.(d.item_id, true)}
              </li>
            ))}
          </ul>
        )
      ) : visiveis.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
          {linhas.length ? "Nenhum item nesta situação." : "Nenhum item no cardápio desta casa. Defina o preço de venda nas fichas para elas entrarem aqui."}
        </p>
      ) : (
        <>
        {agrupado && grupos.length > 0 ? (
          <nav aria-label="Seções do cardápio" className="flex flex-wrap gap-1.5 text-xs print:hidden">
            <Link href={href({ bloco: "" })} aria-current={!bloco ? "page" : undefined}
              className={cn("rounded-full border px-2.5 py-1 font-medium", !bloco ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}>
              Todo o cardápio <span className="tabular-nums opacity-70">{visiveis.length}</span>
            </Link>
            {grupos.map((g) => (
              <Link key={g.nome} href={href({ bloco: g.nome })} aria-current={bloco === g.nome ? "page" : undefined}
                className={cn("rounded-full border px-2.5 py-1", bloco === g.nome ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                {g.nome} <span className="tabular-nums opacity-70">{g.itens.length}</span>
              </Link>
            ))}
          </nav>
        ) : null}
        {agrupado && bloco && !grupos.some((g) => g.nome === bloco) ? (
          <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">Nenhum item de “{bloco}” nesta situação.</p>
        ) : null}
        <div className="overflow-x-auto rounded-xl border print:overflow-visible">
          <table className="w-full min-w-[56rem] text-sm print:min-w-0 print:text-[10px] print:[&_.rounded-full]:text-[9.5px] print:[&_.text-xs]:text-[8.5px]">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 print:px-1.5 print:py-1">Item</th>
                <th className="px-3 py-2 text-right print:px-1.5 print:py-1">Custo</th>
                <th className="px-3 py-2 text-right print:px-1.5 print:py-1">Preço</th>
                <th className="px-3 py-2 text-right print:px-1.5 print:py-1">CMV</th>
                <th className="px-3 py-2 text-right print:px-1.5 print:py-1" title="Preço − CMV − impostos e taxas − despesas fixas e financeira">{resultados ? "Resultado na ponta" : "Margem"}</th>
                <th className="px-3 py-2 text-right print:px-1.5 print:py-1">Preço para a meta</th>
                <th className="px-3 py-2 text-right print:px-1.5 print:py-1">Manter CMV do item</th>
                <th className="px-3 py-2 print:hidden" />
              </tr>
            </thead>
            {agrupado ? (bloco ? grupos.filter((g) => g.nome === bloco) : grupos).map((g) => (
              <tbody key={g.nome} className="divide-y border-t">
                <tr id={ancora(g.nome)} className="scroll-mt-28 bg-muted/30">
                  <th colSpan={8} className="px-3 py-2 text-left text-sm font-semibold print:px-1.5 print:py-1 print:text-[11px]">
                    {g.nome}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {g.itens.length} {g.itens.length === 1 ? "item" : "itens"}
                      {g.itens.some((l) => l.situacao === "acima_da_meta") ? ` · ${g.itens.filter((l) => l.situacao === "acima_da_meta").length} acima da meta` : ""}
                    </span>
                  </th>
                </tr>
                {g.itens.map(linha)}
              </tbody>
            )) : (
              <tbody className="divide-y">{visiveis.map(linha)}</tbody>
            )}
          </table>
        </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        {medias ? <>Abaixo do custo: variação contra o custo pela média das últimas {NOTAS_MEDIA} notas de cada insumo (vermelho = mais caro que a média, verde = mais barato). </> : null}
        Preço para a meta = custo ÷ meta da casa, arredondado pela regra da casa. &quot;Manter CMV do item&quot; usa o CMV que o item tinha
        quando o preço atual foi aprovado (itens de baixo CMV, como água, podem ficar abaixo da meta de propósito).
        Item desativado sai do painel e do CMV médio; o histórico de preços fica guardado e ele volta em “Desativados → Ativar”.
      </p>
    </div>
  )
}

const COR_RESULTADO = { ok: CORES_STATUS.caiu, abaixo_do_alvo: CORES_STATUS.sem_comparacao, prejuizo: CORES_STATUS.subiu, sem_dados: CORES_STATUS.estavel }
function Resultado({ r }: { r: ResultadoItem | undefined }) {
  if (!r || r.situacao === "sem_dados" || r.resultado == null) return <>—</>
  const cor = COR_RESULTADO[r.situacao]
  return (
    <>
      <span className="font-medium" style={{ color: cor.texto }}>{reais(r.resultado)}</span>
      <span className="ml-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold" style={{ color: cor.texto, backgroundColor: cor.fundo }}>
        {percentual(r.resultado_pct)}
      </span>
      {r.preco_ideal_arredondado != null && r.situacao !== "ok" ? (
        <div className="text-xs text-muted-foreground" title={`Preço em que sobra ${percentual(r.lucro_alvo_pct)} de investimento / lucro`}>
          ideal {reais(r.preco_ideal_arredondado)}
        </div>
      ) : null}
    </>
  )
}

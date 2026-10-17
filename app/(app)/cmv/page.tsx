import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { exigirGerencia } from "@/lib/sessao"
import { PainelCmv, FILTROS_CMV, NOTAS_MEDIA, type BlocoItem, type CustoMedia, type ItemDesativado, type LinhaCmv, type ResultadoItem } from "@/components/painel-cmv"
import { EstruturaCustos, type Estrutura } from "@/components/estrutura-custos"
import { FormAcao, BotaoEnviar } from "@/components/form-acao"
import { Entrada } from "@/components/campos"
import { alternarItemCardapio, definirMetaCmv, moverItemSecao, restaurarEstrutura, salvarEstrutura } from "./actions"
import { Selecao } from "@/components/campos"

export const metadata: Metadata = { title: "CMV" }

export default async function Cmv({ searchParams }: { searchParams: Promise<{ situacao?: string; ver?: string; bloco?: string }> }) {
  const s = await exigirGerencia()
  const { situacao = "", ver = "", bloco = "" } = await searchParams
  const filtro = FILTROS_CMV.some((f) => f.valor === situacao) ? situacao : ""
  const supabase = await createClient()
  const [painel, casa, inativos, secoes, estrutura, resultado, mediaNotas] = await Promise.all([
    supabase.rpc("painel_cmv_casa", { p_estab: s.casa.id }),
    supabase.rpc("cmv_da_casa", { p_estab: s.casa.id }),
    supabase.from("itens_cardapio")
      .select("id, receita_id, nome_exibicao, receitas!inner(nome, ativo), cardapios!inner(nome, estabelecimento_id, status)")
      .eq("cardapios.estabelecimento_id", s.casa.id).neq("cardapios.status", "arquivado").eq("ativo", false).eq("receitas.ativo", true),
    // seção e posição de cada item no cardápio, para o painel em blocos
    supabase.from("itens_cardapio").select("id, secao, ordem, cardapios!inner(nome, estabelecimento_id, status)")
      .eq("cardapios.estabelecimento_id", s.casa.id).neq("cardapios.status", "arquivado").eq("ativo", true),
    // estrutura de custos e resultado na ponta (0013); sem a migração, o painel segue sem eles
    supabase.rpc("estrutura_custos", { p_estab: s.casa.id }),
    supabase.rpc("resultado_itens_casa", { p_estab: s.casa.id }),
    // custo atual × média das últimas notas (0017); sem a migração, o selo não aparece
    supabase.rpc("custo_vs_media_casa", { p_estab: s.casa.id, p_n: NOTAS_MEDIA }),
  ])
  const medias = mediaNotas.error ? undefined
    : new Map(((mediaNotas.data ?? []) as CustoMedia[]).map((m) => [m.item_id, m]))
  const est = estrutura.error ? null : ((estrutura.data ?? []) as Estrutura[])[0] ?? null
  const resultados = resultado.error ? undefined
    : new Map(((resultado.data ?? []) as ResultadoItem[]).map((r) => [r.item_id, r]))
  if (painel.error) return <p className="text-sm text-destructive">Não foi possível carregar o painel de CMV.</p>
  const linhas = (painel.data ?? []) as LinhaCmv[]
  const media = ((casa.data ?? []) as { cmv_medio_simples_pct: number | null }[])[0]?.cmv_medio_simples_pct ?? null
  const meta = linhas[0]?.meta_pct ?? 30
  const metaDefinida = linhas[0]?.meta_definida ?? false
  const desativados: ItemDesativado[] = ((inativos.data ?? []) as unknown as {
    id: string; receita_id: string; nome_exibicao: string | null; receitas: { nome: string } | null; cardapios: { nome: string }
  }[]).map((i) => ({ item_id: i.id, receita_id: i.receita_id, produto: i.nome_exibicao ?? i.receitas?.nome ?? "—", cardapio: i.cardapios.nome }))
    .sort((a, b) => a.produto.localeCompare(b.produto, "pt-BR"))
  // blocos na ordem do cardápio impresso: Drinks, depois Bebidas, depois os demais; item sem seção vai para o fim
  const RANK: Record<string, number> = { Drinks: 0, Bebidas: 1 }
  const blocos = new Map<string, BlocoItem>()
  for (const i of (secoes.data ?? []) as unknown as { id: string; secao: string | null; ordem: number; cardapios: { nome: string } }[]) {
    const rank = i.secao ? RANK[i.cardapios.nome] ?? 2 : 9
    blocos.set(i.id, { bloco: i.secao ?? `${i.cardapios.nome} · sem seção`, ordem: rank * 100000 + (i.ordem ?? 0) })
  }
  // seções existentes (na ordem do cardápio) e a seção atual de cada item
  const secaoDoItem = new Map<string, string | null>()
  for (const i of (secoes.data ?? []) as unknown as { id: string; secao: string | null }[]) secaoDoItem.set(i.id, i.secao)
  const listaSecoes = [...new Map([...blocos.entries()].filter(([id]) => secaoDoItem.get(id)).map(([id, b]) => [b.bloco, b.ordem])).entries()]
    .sort((a, b) => a[1] - b[1]).map(([nome]) => nome)
  const moverItem = (itemId: string) => (
    <details className="mt-1 text-right text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:underline">Mover de seção</summary>
      <FormAcao acao={moverItemSecao.bind(null, itemId)} limparAoSalvar={false} className="mt-1 justify-items-end gap-1.5">
        <Selecao name="secao" defaultValue={secaoDoItem.get(itemId) ?? ""} aria-label="Seção" className="h-8 w-56 text-xs">
          <option value="">Escolha a seção…</option>
          {listaSecoes.map((n) => <option key={n} value={n}>{n}</option>)}
        </Selecao>
        <Entrada name="nova" maxLength={80} placeholder="ou nome de seção nova" aria-label="Seção nova" className="h-8 w-56 text-xs" />
        <BotaoEnviar variant="outline" className="h-8 px-3 text-xs" enviando="Movendo…">Mover</BotaoEnviar>
      </FormAcao>
    </details>
  )
  const botaoItem = (itemId: string, ativar: boolean) => (
    <FormAcao acao={alternarItemCardapio.bind(null, itemId, ativar)} className="gap-1">
      <BotaoEnviar variant={ativar ? "outline" : "ghost"} enviando={ativar ? "Ativando…" : "Desativando…"}
        className={ativar ? "h-8 px-3 text-sm" : "h-8 px-2 text-xs text-muted-foreground"}>
        {ativar ? "Ativar" : "Desativar"}
      </BotaoEnviar>
    </FormAcao>
  )

  const formMeta = s.admin ? (
    <details className="mt-1 text-sm print:hidden">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:underline">Alterar meta</summary>
      <FormAcao acao={definirMetaCmv} limparAoSalvar={false} className="mt-2 gap-2">
        <div className="flex items-center gap-2">
          <Entrada name="meta" inputMode="decimal" defaultValue={String(meta).replace(".", ",")} aria-label="Meta de CMV (%)" className="h-9 w-20 text-right" />
          <span className="text-muted-foreground">%</span>
          <BotaoEnviar variant="outline" className="h-9 px-3">Salvar</BotaoEnviar>
        </div>
      </FormAcao>
    </details>
  ) : null

  return <PainelCmv linhas={linhas} filtro={filtro} media={media} meta={Number(meta)} metaDefinida={metaDefinida} casa={s.casa.nome} logo={s.casa.logo} formMeta={formMeta}
    desativados={desativados} botaoItem={botaoItem} blocos={blocos} agrupado={ver !== "lista"} moverItem={moverItem}
    bloco={bloco.slice(0, 120)} resultados={resultados} medias={medias} estrutura={est ? <EstruturaCustos e={est} salvar={salvarEstrutura} restaurar={restaurarEstrutura} /> : null} />
}

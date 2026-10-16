import Link from "next/link"
import { custoPorUnidade, dataCurta, dataHora, numero, reais, rotuloUnidade, UNIDADES_POR_DIMENSAO, type Dimensao } from "@/lib/formato"
import { FormAcao, BotaoEnviar, type Acao } from "@/components/form-acao"
import { Entrada, Selecao } from "@/components/campos"
import { CORES_STATUS } from "@/components/status-preco"
import { pctPreciso } from "@/components/indicador-preco"

// Conferência de compras com alta acima do limite (0012): dados de conferencias_da_casa
export type Conferencia = {
  id: string; historico_preco_id: string; insumo_id: string; insumo: string; dimensao: Dimensao
  data_compra: string; fornecedor: string | null; documento_ref: string | null
  quantidade: number; unidade: string; valor_total: number
  custo_novo: number; custo_referencia: number; variacao_pct: number; limite_pct: number
  status: "aberta" | "aprovada" | "corrigida" | "rejeitada"; justificativa: string | null
  responsavel: string | null; resolvido_em: string | null; criado_em: string
}

export function ConferenciaAberta({ c, acao }: { c: Conferencia; acao: Acao }) {
  const cor = CORES_STATUS.subiu
  const unidades = UNIDADES_POR_DIMENSAO[c.dimensao]
  return (
    <div className="grid gap-2 rounded-lg border p-3" style={{ borderColor: cor.fundo }}>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span>
          <Link href={`/insumos/${c.insumo_id}`} className="font-medium hover:underline">{c.insumo}</Link>
          {" · "}{dataCurta(c.data_compra)} · {numero(c.quantidade)} {rotuloUnidade(c.unidade)} · {reais(c.valor_total)}
          {c.fornecedor ? ` · ${c.fornecedor}` : ""}{c.documento_ref ? ` · ${c.documento_ref}` : ""}
        </span>
        <span className="font-medium tabular-nums">{custoPorUnidade(c.custo_novo, c.dimensao)}</span>
      </div>
      <p className="rounded-md px-3 py-2 text-sm" style={{ color: cor.texto, backgroundColor: cor.fundo }}>
        <b>▲ {pctPreciso(c.variacao_pct)}</b> sobre o custo validado ({custoPorUnidade(c.custo_referencia, c.dimensao)} → {custoPorUnidade(c.custo_novo, c.dimensao)}).
        {" "}Acima do limite de {pctPreciso(c.limite_pct, false)}: o custo anterior continua valendo até a conferência.
      </p>
      <FormAcao acao={acao} className="gap-2">
        <Entrada name="justificativa" required minLength={3} maxLength={500} placeholder="Justificativa (obrigatória): ex. reajuste confirmado com o fornecedor" aria-label="Justificativa" />
        <div className="flex flex-wrap gap-2">
          <BotaoEnviar name="acao" value="aprovar">Aprovar</BotaoEnviar>
          <BotaoEnviar name="acao" value="rejeitar" variant="outline">Rejeitar</BotaoEnviar>
        </div>
        <details className="rounded-md border px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Corrigir quantidade ou valor (erro de digitação, embalagem diferente…)</summary>
          <div className="mt-2 grid grid-cols-[1fr_6rem_1fr] gap-2 sm:grid-cols-[8rem_6rem_9rem_auto] sm:items-end">
            <Entrada name="quantidade" inputMode="decimal" defaultValue={String(c.quantidade).replace(".", ",")} aria-label="Quantidade corrigida" />
            <Selecao name="unidade" defaultValue={unidades.some((u) => u.codigo === c.unidade) ? c.unidade : unidades[0].codigo} aria-label="Unidade">
              {unidades.map((u) => <option key={u.codigo} value={u.codigo}>{u.nome}</option>)}
            </Selecao>
            <Entrada name="valor" inputMode="decimal" defaultValue={String(c.valor_total).replace(".", ",")} aria-label="Valor total corrigido (R$)" />
            <BotaoEnviar name="acao" value="corrigir" variant="outline" className="col-span-3 sm:col-span-1">Corrigir e validar</BotaoEnviar>
          </div>
        </details>
      </FormAcao>
    </div>
  )
}

const DECISAO: Record<Conferencia["status"], { rotulo: string; cor: { texto: string; fundo: string } }> = {
  aberta: { rotulo: "Aberta", cor: CORES_STATUS.sem_comparacao },
  aprovada: { rotulo: "Aprovada", cor: CORES_STATUS.estavel },
  corrigida: { rotulo: "Corrigida", cor: CORES_STATUS.sem_comparacao },
  rejeitada: { rotulo: "Rejeitada", cor: CORES_STATUS.subiu },
}

export function ConferenciasResolvidas({ lista }: { lista: Conferencia[] }) {
  if (!lista.length) return <p className="text-sm text-muted-foreground">Nenhuma conferência resolvida ainda.</p>
  return (
    <ul className="divide-y rounded-lg border">
      {lista.map((c) => (
        <li key={c.id} className="grid gap-1 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/insumos/${c.insumo_id}`} className="font-medium hover:underline">{c.insumo}</Link>
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ color: DECISAO[c.status].cor.texto, backgroundColor: DECISAO[c.status].cor.fundo }}>
              {DECISAO[c.status].rotulo}
            </span>
            <span className="text-xs text-muted-foreground">compra de {dataCurta(c.data_compra)} · alta de {pctPreciso(c.variacao_pct)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            “{c.justificativa}” — {c.responsavel ?? "usuário"}, {dataHora(c.resolvido_em)}
          </div>
        </li>
      ))}
    </ul>
  )
}

export type Limite = { id: string; categoria_id: string | null; limite_pct: number }

export function LimitesConferencia({ limites, categorias, salvar, remover }: {
  limites: Limite[]; categorias: { id: string; nome: string }[]; salvar: Acao; remover: (id: string) => Acao
}) {
  const geral = limites.find((l) => l.categoria_id == null)
  const porCategoria = limites.filter((l) => l.categoria_id != null)
  const nome = new Map(categorias.map((c) => [c.id, c.nome]))
  return (
    <div className="grid gap-3">
      <FormAcao acao={salvar} limparAoSalvar={false} className="gap-2">
        <label className="text-sm font-medium" htmlFor="limite-geral">Limite geral da casa</label>
        <div className="flex items-center gap-2">
          <Entrada id="limite-geral" name="limite" inputMode="decimal" defaultValue={String(geral?.limite_pct ?? 15).replace(".", ",")} className="h-9 w-24 text-right" />
          <span className="text-muted-foreground">%</span>
          <BotaoEnviar variant="outline" className="h-9 px-3">Salvar</BotaoEnviar>
          {geral ? null : <span className="text-xs text-muted-foreground">(padrão do sistema: 15%)</span>}
        </div>
      </FormAcao>
      {porCategoria.length ? (
        <ul className="divide-y rounded-lg border text-sm">
          {porCategoria.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
              <span>{nome.get(l.categoria_id!) ?? "Categoria"}</span>
              <span className="flex items-center gap-2">
                <b className="tabular-nums">{pctPreciso(l.limite_pct, false)}</b>
                <FormAcao acao={remover(l.id)}><BotaoEnviar variant="ghost" className="h-8 px-2 text-destructive">Remover</BotaoEnviar></FormAcao>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <FormAcao acao={salvar} className="gap-2">
        <span className="text-sm font-medium">Limite por categoria</span>
        <div className="grid grid-cols-[1fr_6rem_auto] items-center gap-2">
          <Selecao name="categoria_id" required defaultValue="" aria-label="Categoria">
            <option value="" disabled>Escolha a categoria…</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Selecao>
          <Entrada name="limite" inputMode="decimal" required placeholder="%" aria-label="Limite (%)" className="text-right" />
          <BotaoEnviar variant="outline" className="h-10 px-3">Adicionar</BotaoEnviar>
        </div>
        <p className="text-xs text-muted-foreground">A categoria vale para as subcategorias. Ex.: hortifrúti oscila mais (25%), destilados menos (10%).</p>
      </FormAcao>
    </div>
  )
}

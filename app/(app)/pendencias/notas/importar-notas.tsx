"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { Button, buttonVariants } from "@/components/ui/button"
import { Entrada, Selecao } from "@/components/campos"
import { NovoInsumoRapido, type CategoriaOpcao } from "@/components/novo-insumo-rapido"
import { BuscaInsumo } from "@/components/busca-insumo"
import { dimensaoProvavel, nomeSugerido, sugerirConversao } from "@/lib/sugestoes-nota"
import { dataCurta, numero, reais, rotuloUnidade, UNIDADES_POR_DIMENSAO, type Dimensao } from "@/lib/formato"
import {
  chaveDescricao,
  type Arquivo, type EscolhaNota, type PreviaNota, type ResultadoImportacao, type ResultadoLeitura, type Vinculo,
} from "@/lib/importacao"
import { cn } from "@/lib/utils"
import { emLotes, lerArquivosEscolhidos } from "@/lib/arquivos-notas"
import { importarNotas, lerNotas, vinculosDoFornecedor } from "./actions"

type InsumoOpcao = { id: string; nome: string; dimensao: Dimensao }
type Rascunho = { tipo: "conversao" | "pesagem" | "ignorar"; insumoId: string; quantidade: string; unidade: string }
type EstadoNota = { fornecedor: string; vinculos: Record<string, Vinculo | null> }
type Ocorrencia = { notaChave: string; numero: string; n: number; quantidade: number; valorTotal: number }
// Mesmo produto do mesmo fornecedor = uma decisão só, valendo para todas as notas
type Grupo = {
  chave: string; fornecedorNome: string; descricao: string; unidade: string
  vinculo: Vinculo | null; ocorrencias: Ocorrencia[]
}

const numeroDigitado = (v: string) => Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v)

function rascunhoValido(r: Rascunho | undefined, insumos: Map<string, InsumoOpcao>): boolean {
  if (!r) return false
  if (r.tipo === "ignorar") return true
  if (!insumos.has(r.insumoId)) return false
  if (r.tipo === "pesagem") return true
  return numeroDigitado(r.quantidade) > 0 && !!r.unidade
}

const chaveFornecedor = (p: PreviaNota, e: EstadoNota) =>
  e.fornecedor === "novo" ? `novo:${p.nota.emitente.documento || p.nota.emitente.nome}` : e.fornecedor
const chaveGrupo = (fornecedor: string, descricao: string) => `${fornecedor}|${chaveDescricao(descricao)}`

export function ImportarNotas({ insumos: insumosIniciais, categorias, casa, totalCasas, admin }: {
  insumos: InsumoOpcao[]; categorias: CategoriaOpcao[]; casa: string; totalCasas: number; admin: boolean
}) {
  const [todasAsCasas, setTodasAsCasas] = useState(admin && totalCasas > 1)
  const [modo, setModo] = useState<"definir" | "notas">("definir")
  const [progresso, setProgresso] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [arquivos, setArquivos] = useState<Arquivo[]>([])
  const [leitura, setLeitura] = useState<ResultadoLeitura | null>(null)
  const [estados, setEstados] = useState<Record<string, EstadoNota>>({})
  const [decisoes, setDecisoes] = useState<Record<string, Rascunho>>({})
  const [alterar, setAlterar] = useState<Record<string, boolean>>({})
  const [insumos, setInsumos] = useState<InsumoOpcao[]>(insumosIniciais)
  const [cadastrando, setCadastrando] = useState<{ grupo: string; descricao: string; unidade: string; nome: string; dimensao?: Dimensao } | null>(null)
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const porId = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos])

  const paraImportar = useMemo(() => (leitura?.previas ?? []).filter((p) => !p.jaImportada), [leitura])
  const nomeFornecedor = useCallback((p: PreviaNota, e: EstadoNota) =>
    e.fornecedor === "novo"
      ? `${p.nota.emitente.fantasia || p.nota.emitente.nome} (novo)`
      : leitura?.fornecedores.find((f) => f.id === e.fornecedor)?.nome ?? p.nota.emitente.nome, [leitura])

  // Itens agrupados por fornecedor + descrição, na ordem em que aparecem
  const grupos = useMemo(() => {
    const mapa = new Map<string, Grupo>()
    for (const p of paraImportar) {
      const e = estados[p.nota.chave]
      if (!e) continue
      const forn = chaveFornecedor(p, e)
      for (const item of p.nota.itens) {
        const k = chaveGrupo(forn, item.descricao)
        const g = mapa.get(k) ?? {
          chave: k, fornecedorNome: nomeFornecedor(p, e), descricao: item.descricao, unidade: item.unidade,
          vinculo: e.vinculos[chaveDescricao(item.descricao)] ?? null, ocorrencias: [],
        }
        g.ocorrencias.push({ notaChave: p.nota.chave, numero: p.nota.numero, n: item.n, quantidade: item.quantidade, valorTotal: item.valorTotal })
        mapa.set(k, g)
      }
    }
    return [...mapa.values()]
  }, [paraImportar, estados, nomeFornecedor])

  const automatico = (g: Grupo) => !!g.vinculo && !alterar[g.chave]
  const aDefinir = grupos.filter((g) => !automatico(g))
  const faltando = aDefinir.filter((g) => !rascunhoValido(decisoes[g.chave], porId))

  // ---------------------------------------------------------------- 1. enviar arquivos
  async function escolherArquivos(lista: FileList | null) {
    if (!lista?.length) return
    setErro(null); setResultado(null); setLeitura(null)
    const { arquivos: lidos, avisos: avisosArquivos } = await lerArquivosEscolhidos([...lista])
    setAvisos(avisosArquivos)
    if (!lidos.length) return
    iniciar(async () => {
      try {
        // Lê em lotes para não estourar o tamanho de cada envio ao servidor
        const r: ResultadoLeitura = { previas: [], erros: [], fornecedores: [] }
        const lotes = emLotes(lidos, 15)
        for (const [k, lote] of lotes.entries()) {
          setProgresso(`Lendo notas… ${Math.min((k + 1) * 15, lidos.length)} de ${lidos.length}`)
          const parte = await lerNotas(lote)
          const chaves = new Set(r.previas.map((p) => p.nota.chave))
          for (const p of parte.previas) {
            if (chaves.has(p.nota.chave)) r.erros.push({ arquivo: p.arquivo, erro: "Mesma nota enviada duas vezes." })
            else r.previas.push(p)
          }
          r.erros.push(...parte.erros)
          if (!r.fornecedores.length) r.fornecedores = parte.fornecedores
        }
        setProgresso(null)
        setArquivos(lidos)
        setLeitura(r)
        const novos: Record<string, EstadoNota> = {}
        for (const p of r.previas) novos[p.nota.chave] = { fornecedor: p.fornecedorSugerido?.id ?? "novo", vinculos: p.vinculos }
        setEstados(novos)
        setDecisoes({}); setAlterar({})
      } catch {
        setProgresso(null)
        setErro("Não foi possível ler as notas. Tente de novo.")
      }
    })
  }

  // ---------------------------------------------------------------- 2. conferência
  const atualizarDecisao = (grupo: string, mudar: Partial<Rascunho>) =>
    setDecisoes((atual) => ({
      ...atual,
      [grupo]: { ...(atual[grupo] ?? { tipo: "conversao", insumoId: "", quantidade: "", unidade: "" }), ...mudar },
    }))

  // Ao escolher o insumo, sugere a conversão lendo a descrição ("750ML", "C/12", "FD/0030"…)
  const escolherInsumo = useCallback((grupo: string, descricao: string, unidadeNota: string, insumoId: string, lista: Map<string, InsumoOpcao>) => {
    const ins = lista.get(insumoId)
    const unidades = ins ? UNIDADES_POR_DIMENSAO[ins.dimensao].map((u) => u.codigo) : []
    const sugestao = ins ? sugerirConversao(descricao, unidadeNota, ins.dimensao) : null
    setDecisoes((atual) => ({
      ...atual,
      [grupo]: {
        ...(atual[grupo] ?? { tipo: "conversao", insumoId: "", quantidade: "", unidade: "" }),
        insumoId,
        quantidade: sugestao ? String(sugestao.quantidade).replace(".", ",") : "",
        unidade: sugestao?.unidade ?? unidades[0] ?? "",
      },
    }))
  }, [])

  function trocarFornecedor(p: PreviaNota, fornecedor: string) {
    setEstados((atual) => ({ ...atual, [p.nota.chave]: { ...atual[p.nota.chave], fornecedor } }))
    iniciar(async () => {
      const vinculos = await vinculosDoFornecedor(fornecedor === "novo" ? null : fornecedor, p.nota.itens.map((i) => i.descricao))
      setEstados((atual) => ({ ...atual, [p.nota.chave]: { ...atual[p.nota.chave], vinculos } }))
    })
  }

  const aoCriarInsumo = useCallback((novo: InsumoOpcao) => {
    setInsumos((atual) => (atual.some((i) => i.id === novo.id) ? atual : [...atual, novo].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))))
    if (cadastrando) {
      const lista = new Map(porId)
      lista.set(novo.id, novo)
      escolherInsumo(cadastrando.grupo, cadastrando.descricao, cadastrando.unidade, novo.id, lista)
    }
    setCadastrando(null)
  }, [cadastrando, porId, escolherInsumo])

  // ---------------------------------------------------------------- 3. importar
  function importar() {
    const escolhas: Record<string, EscolhaNota> = {}
    for (const p of paraImportar) {
      const e = estados[p.nota.chave]
      const forn = chaveFornecedor(p, e)
      const decisoesNota: EscolhaNota["decisoes"] = {}
      for (const i of p.nota.itens) {
        const k = chaveGrupo(forn, i.descricao)
        if (e.vinculos[chaveDescricao(i.descricao)] && !alterar[k]) continue
        const r = decisoes[k]
        if (!r) continue
        decisoesNota[i.n] = r.tipo === "ignorar" ? { tipo: "ignorar" }
          : r.tipo === "pesagem" ? { tipo: "pesagem", insumoId: r.insumoId }
          : { tipo: "conversao", insumoId: r.insumoId, quantidadePorUnidade: numeroDigitado(r.quantidade), unidade: r.unidade }
      }
      escolhas[p.nota.chave] = { fornecedor: e.fornecedor, decisoes: decisoesNota }
    }
    const selecionados = arquivos.filter((a) => paraImportar.some((p) => p.arquivo === a.nome))
    iniciar(async () => {
      const total: ResultadoImportacao = { notas: [], precosAtualizados: 0, aguardandoPesagem: 0, ignorados: 0 }
      try {
        for (const [k, lote] of emLotes(selecionados, 10).entries()) {
          setProgresso(`Importando… ${Math.min((k + 1) * 10, selecionados.length)} de ${selecionados.length} nota(s)`)
          const r = await importarNotas(lote, escolhas, { todasAsCasas })
          total.notas.push(...r.notas)
          total.precosAtualizados += r.precosAtualizados
          total.aguardandoPesagem += r.aguardandoPesagem
          total.ignorados += r.ignorados
        }
        setResultado(total)
        setLeitura(null)
      } catch {
        // Notas já importadas são puladas numa nova tentativa (chave de acesso)
        if (total.notas.length) setResultado(total)
        setErro("A importação parou no meio. Envie as notas de novo: as que já entraram serão puladas.")
      } finally {
        setProgresso(null)
      }
    })
  }

  // ---------------------------------------------------------------- partes da tela
  function editorGrupo(g: Grupo) {
    const r = decisoes[g.chave]
    const tipo = r?.tipo ?? "conversao"
    const ins = r ? porId.get(r.insumoId) : undefined
    const ok = rascunhoValido(r, porId)
    return (
      <div className={cn("grid gap-2 rounded-md p-2", ok ? "bg-emerald-500/10" : "bg-amber-500/10")}>
        <div className="flex flex-wrap gap-3">
          {(["conversao", "pesagem", "ignorar"] as const).map((t) => (
            <label key={t} className="flex items-center gap-1.5">
              <input type="radio" name={`tipo-${g.chave}`} className="size-4" checked={tipo === t} onChange={() => atualizarDecisao(g.chave, { tipo: t })} />
              {t === "conversao" ? "Quantidade fixa" : t === "pesagem" ? "Peso variável (pesar no recebimento)" : "Não é insumo (ignorar)"}
            </label>
          ))}
        </div>
        {tipo !== "ignorar" ? (
          <div className="grid gap-1">
            <BuscaInsumo
              insumos={insumos}
              valor={r?.insumoId ?? ""}
              referencia={g.descricao}
              aoEscolher={(id) => (id ? escolherInsumo(g.chave, g.descricao, g.unidade, id, porId) : atualizarDecisao(g.chave, { insumoId: "", quantidade: "" }))}
              aoCadastrar={(texto) => setCadastrando({
                grupo: g.chave, descricao: g.descricao, unidade: g.unidade,
                nome: texto.trim() || nomeSugerido(g.descricao), dimensao: dimensaoProvavel(g.descricao, g.unidade),
              })}
            />
          </div>
        ) : null}
        {tipo === "conversao" && ins ? (
          <div className="flex flex-wrap items-center gap-2">
            <span>1 {g.unidade} =</span>
            <Entrada
              className="w-24" inputMode="decimal" aria-label="Quantidade por unidade da nota"
              value={r?.quantidade ?? ""} placeholder="12"
              onChange={(ev) => atualizarDecisao(g.chave, { quantidade: ev.target.value })}
            />
            <Selecao className="w-24" aria-label="Unidade" value={r?.unidade ?? ""} onChange={(ev) => atualizarDecisao(g.chave, { unidade: ev.target.value })}>
              {UNIDADES_POR_DIMENSAO[ins.dimensao].map((u) => <option key={u.codigo} value={u.codigo}>{u.nome}</option>)}
            </Selecao>
            <span className="text-xs text-muted-foreground">ex.: 1 CX = 12 L · 1 KG = 1 kg</span>
          </div>
        ) : null}
        {cadastrando?.grupo === g.chave ? (
          <NovoInsumoRapido
            key={cadastrando.nome}
            categorias={categorias} nomeInicial={cadastrando.nome} dimensaoInicial={cadastrando.dimensao}
            aoCancelar={() => setCadastrando(null)} aoCriar={aoCriarInsumo}
          />
        ) : null}
      </div>
    )
  }

  function resumoAutomatico(g: Grupo) {
    const v = g.vinculo!
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-emerald-800 dark:text-emerald-300">
          ✓ {v.insumoNome} · {v.tipo === "conversao" ? `1 ${g.unidade} = ${numero(v.quantidadePorUnidade)} ${rotuloUnidade(v.unidade)}` : "pesar/contar no recebimento"}
        </span>
        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setAlterar((a) => ({ ...a, [g.chave]: true }))}>
          alterar
        </button>
      </div>
    )
  }

  // ---------------------------------------------------------------- tela
  if (resultado) {
    return (
      <div className="grid gap-4">
        <div className="grid gap-1 rounded-xl border p-4">
          <h2 className="font-semibold">Importação concluída</h2>
          <p className="text-sm">
            {resultado.precosAtualizados} preço(s) atualizado(s) · {resultado.aguardandoPesagem} aguardando pesagem · {resultado.ignorados} ignorado(s)
          </p>
        </div>
        {erro ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p> : null}
        <ul className="divide-y rounded-xl border">
          {resultado.notas.map((n) => (
            <li key={n.arquivo} className="grid gap-0.5 px-4 py-3 text-sm">
              <span className="font-medium">{n.ok ? "✓" : "⚠"} NF {n.numero} · {n.fornecedor}</span>
              <span className={n.ok ? "text-muted-foreground" : "text-destructive"}>{n.mensagem}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Link href="/insumos?ordem=alta" className={buttonVariants({ className: "h-10 px-4" })}>Ver variação dos insumos</Link>
          <Link href="/pendencias" className={buttonVariants({ variant: "outline", className: "h-10 px-4" })}>Ir para Compras</Link>
          <Button variant="ghost" className="h-10 px-4" onClick={() => { setResultado(null); setArquivos([]); setErro(null) }}>Importar outras notas</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <label className={cn("grid cursor-pointer place-items-center gap-1 rounded-xl border-2 border-dashed p-6 text-center hover:bg-muted/40", pendente && "opacity-60")}>
        <span className="font-medium">Escolher XML das notas fiscais (ou o .zip exportado)</span>
        <span className="text-sm text-muted-foreground">
          Pode selecionar vários arquivos ou um .zip com todas as notas do período (até 300). Casa atual: {casa}.
        </span>
        <input
          type="file" accept=".xml,.zip,text/xml,application/xml,application/zip" multiple className="sr-only"
          disabled={pendente}
          onChange={(e) => { escolherArquivos(e.target.files); e.target.value = "" }}
        />
      </label>
      {progresso ? <p role="status" className="text-sm font-medium">{progresso}</p> : null}
      {erro ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p> : null}
      {avisos.map((a) => (
        <p key={a} className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">{a}</p>
      ))}
      {leitura?.erros.map((e) => (
        <p key={e.arquivo + e.erro} className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <b>{e.arquivo}</b>: {e.erro}
        </p>
      ))}

      {leitura?.previas.length ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {leitura.previas.length} nota(s) lida(s) · {paraImportar.length} para importar
            {leitura.previas.length > paraImportar.length ? ` · ${leitura.previas.length - paraImportar.length} já importada(s)` : ""}
            {" · "}{grupos.length} produto(s) diferentes, {grupos.length - aDefinir.length} já conhecido(s)
          </p>
          <div className="flex gap-1 rounded-lg border p-0.5" role="group" aria-label="Mostrar">
            {([["definir", `Só itens a definir (${faltando.length})`], ["notas", "Por nota (tudo)"]] as const).map(([m, rotulo]) => (
              <button
                key={m} type="button" aria-pressed={modo === m} onClick={() => setModo(m)}
                className={cn("rounded-md px-3 py-1.5 text-sm", modo === m ? "bg-foreground text-background" : "hover:bg-muted")}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------ itens a definir (agrupados) */}
      {leitura && modo === "definir" ? (
        aDefinir.length === 0 ? (
          <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
            {paraImportar.length ? "Todos os itens já são conhecidos. É só importar." : "Nenhuma nota nova para importar."}
          </p>
        ) : (
          <ul className="grid gap-3">
            {aDefinir.map((g) => {
              const qtd = g.ocorrencias.reduce((t, o) => t + o.quantidade, 0)
              const valor = g.ocorrencias.reduce((t, o) => t + o.valorTotal, 0)
              const notas = new Set(g.ocorrencias.map((o) => o.numero))
              return (
                <li key={g.chave} className="grid gap-2 rounded-xl border p-3 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{g.descricao}</span>
                    <span className="tabular-nums text-muted-foreground">{numero(qtd)} {g.unidade} · {reais(valor)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {g.fornecedorNome} · aparece em {notas.size} nota(s): {[...notas].slice(0, 6).join(", ")}{notas.size > 6 ? "…" : ""}
                  </p>
                  {editorGrupo(g)}
                </li>
              )
            })}
          </ul>
        )
      ) : null}

      {/* ------------------------------------------------ por nota */}
      {leitura && modo === "notas" ? leitura.previas.map((p) => {
        const e = estados[p.nota.chave]
        if (!e) return null
        const forn = chaveFornecedor(p, e)
        return (
          <section key={p.nota.chave} className={cn("grid gap-3 rounded-xl border p-4", p.jaImportada && "opacity-60")}>
            <header className="grid gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">NF {p.nota.numero} · {p.nota.emitente.fantasia || p.nota.emitente.nome}</h2>
                <span className="text-sm tabular-nums">{dataCurta(p.nota.dataEmissao)} · {reais(p.nota.valorNota)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                CNPJ {p.nota.emitente.documento} · para {p.nota.destinatario.nome ?? "—"} · arquivo {p.arquivo}
              </p>
              {p.jaImportada ? <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Esta nota já foi importada nesta casa e será pulada.</p> : null}
              {p.nota.autorizada === false ? <p className="text-sm font-medium text-destructive">Atenção: o XML indica que a nota não está autorizada pela SEFAZ.</p> : null}
            </header>
            {!p.jaImportada ? (
              <>
                <label className="grid gap-1 text-sm sm:max-w-md">
                  <span>Fornecedor</span>
                  <Selecao value={e.fornecedor} onChange={(ev) => trocarFornecedor(p, ev.target.value)}>
                    <option value="novo">+ Cadastrar novo: {p.nota.emitente.fantasia || p.nota.emitente.nome}</option>
                    {leitura.fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </Selecao>
                  {p.fornecedorSugerido && e.fornecedor === p.fornecedorSugerido.id ? (
                    <span className="text-xs text-muted-foreground">Reconhecido {p.fornecedorSugerido.porDocumento ? "pelo CNPJ" : "pelo nome; confira"}.</span>
                  ) : null}
                </label>
                <ul className="divide-y rounded-lg border">
                  {p.nota.itens.map((item) => {
                    const g = grupos.find((x) => x.chave === chaveGrupo(forn, item.descricao))
                    if (!g) return null
                    return (
                      <li key={item.n} className="grid gap-2 px-3 py-3 text-sm">
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="font-medium">{item.n}. {item.descricao}</span>
                          <span className="tabular-nums text-muted-foreground">{numero(item.quantidade)} {item.unidade} · {reais(item.valorTotal)}</span>
                        </div>
                        {automatico(g) ? resumoAutomatico(g) : editorGrupo(g)}
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : null}
          </section>
        )
      }) : null}

      {paraImportar.length ? (
        <div className="sticky bottom-0 grid gap-2 border-t bg-background/95 py-3 backdrop-blur sm:flex sm:items-center sm:justify-between">
          {totalCasas > 1 ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={todasAsCasas} onChange={(e) => setTodasAsCasas(e.target.checked)} />
              Aplicar os preços em todas as {totalCasas} casas (pesagem fica só em {casa})
            </label>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {faltando.length
              ? `Falta definir ${faltando.length} produto(s) para importar.`
              : `Tudo conferido: ${paraImportar.length} nota(s) prontas. Os preços entram validados.`}
          </p>
          <Button className="h-11 px-5" disabled={pendente || faltando.length > 0} onClick={importar}>
            {pendente ? "Importando…" : `Importar ${paraImportar.length} nota(s)`}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

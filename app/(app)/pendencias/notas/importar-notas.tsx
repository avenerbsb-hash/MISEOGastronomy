"use client"

import { useCallback, useState, useTransition } from "react"
import Link from "next/link"
import { Button, buttonVariants } from "@/components/ui/button"
import { Entrada, Selecao } from "@/components/campos"
import { NovoInsumoRapido, type CategoriaOpcao } from "@/components/novo-insumo-rapido"
import { dataCurta, numero, reais, rotuloUnidade, UNIDADES_POR_DIMENSAO, type Dimensao } from "@/lib/formato"
import {
  chaveDescricao, UNIDADE_NOTA_PADRAO,
  type Arquivo, type EscolhaNota, type PreviaNota, type ResultadoImportacao, type ResultadoLeitura, type Vinculo,
} from "@/lib/importacao"
import { cn } from "@/lib/utils"
import { importarNotas, lerNotas, vinculosDoFornecedor } from "./actions"

type InsumoOpcao = { id: string; nome: string; dimensao: Dimensao }
type Rascunho = { tipo: "conversao" | "pesagem" | "ignorar"; insumoId: string; quantidade: string; unidade: string }
type EstadoNota = { fornecedor: string; vinculos: Record<string, Vinculo | null>; itens: Record<number, Rascunho | undefined>; alterar: Record<number, boolean> }

const numeroDigitado = (v: string) => Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v)

function rascunhoValido(r: Rascunho | undefined, insumos: Map<string, InsumoOpcao>): boolean {
  if (!r) return false
  if (r.tipo === "ignorar") return true
  if (!insumos.has(r.insumoId)) return false
  if (r.tipo === "pesagem") return true
  return numeroDigitado(r.quantidade) > 0 && !!r.unidade
}

export function ImportarNotas({ insumos: insumosIniciais, categorias, casa }: {
  insumos: InsumoOpcao[]; categorias: CategoriaOpcao[]; casa: string
}) {
  const [arquivos, setArquivos] = useState<Arquivo[]>([])
  const [leitura, setLeitura] = useState<ResultadoLeitura | null>(null)
  const [estados, setEstados] = useState<Record<string, EstadoNota>>({})
  const [insumos, setInsumos] = useState<InsumoOpcao[]>(insumosIniciais)
  const [cadastrando, setCadastrando] = useState<{ chave: string; n: number; nome: string; dimensao?: Dimensao } | null>(null)
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const porId = new Map(insumos.map((i) => [i.id, i]))

  // ---------------------------------------------------------------- 1. enviar arquivos
  async function escolherArquivos(lista: FileList | null) {
    if (!lista?.length) return
    setErro(null); setResultado(null)
    const lidos = await Promise.all([...lista].map(async (f) => ({ nome: f.name, conteudo: await f.text() })))
    iniciar(async () => {
      try {
        const r = await lerNotas(lidos)
        setArquivos(lidos)
        setLeitura(r)
        const novos: Record<string, EstadoNota> = {}
        for (const p of r.previas) {
          novos[p.nota.chave] = { fornecedor: p.fornecedorSugerido?.id ?? "novo", vinculos: p.vinculos, itens: {}, alterar: {} }
        }
        setEstados(novos)
      } catch {
        setErro("Não foi possível ler as notas. Tente de novo.")
      }
    })
  }

  // ---------------------------------------------------------------- 2. conferência
  const atualizarNota = (chave: string, mudar: (e: EstadoNota) => EstadoNota) =>
    setEstados((atual) => ({ ...atual, [chave]: mudar(atual[chave]) }))

  const atualizarItem = (chave: string, n: number, mudar: Partial<Rascunho>) =>
    atualizarNota(chave, (e) => {
      const base: Rascunho = e.itens[n] ?? { tipo: "conversao", insumoId: "", quantidade: "", unidade: "" }
      return { ...e, itens: { ...e.itens, [n]: { ...base, ...mudar } } }
    })

  // Ao escolher o insumo, sugere a conversão quando a unidade da nota já é kg, L, un…
  function escolherInsumo(chave: string, n: number, unidadeNota: string, insumoId: string, lista = porId) {
    const ins = lista.get(insumoId)
    const padrao = UNIDADE_NOTA_PADRAO[unidadeNota]
    const unidades = ins ? UNIDADES_POR_DIMENSAO[ins.dimensao].map((u) => u.codigo) : []
    const sugere = ins && padrao && padrao.dimensao === ins.dimensao
    atualizarItem(chave, n, {
      insumoId,
      quantidade: sugere ? "1" : "",
      unidade: sugere ? padrao.unidade : unidades[0] ?? "",
    })
  }

  function trocarFornecedor(p: PreviaNota, fornecedor: string) {
    atualizarNota(p.nota.chave, (e) => ({ ...e, fornecedor }))
    iniciar(async () => {
      const vinculos = await vinculosDoFornecedor(fornecedor === "novo" ? null : fornecedor, p.nota.itens.map((i) => i.descricao))
      atualizarNota(p.nota.chave, (e) => ({ ...e, vinculos }))
    })
  }

  const aoCriarInsumo = useCallback((novo: InsumoOpcao) => {
    setInsumos((atual) => (atual.some((i) => i.id === novo.id) ? atual : [...atual, novo].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))))
    if (cadastrando) {
      const lista = new Map(insumos.map((i) => [i.id, i]))
      lista.set(novo.id, novo)
      const p = leitura?.previas.find((x) => x.nota.chave === cadastrando.chave)
      const item = p?.nota.itens.find((i) => i.n === cadastrando.n)
      if (item) escolherInsumo(cadastrando.chave, cadastrando.n, item.unidade, novo.id, lista)
    }
    setCadastrando(null)
    // escolherInsumo é recriada a cada render; o cadastro rápido chama isto uma vez por insumo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leitura, cadastrando, insumos])

  const paraImportar = (leitura?.previas ?? []).filter((p) => !p.jaImportada)
  const pendencias = paraImportar.flatMap((p) => {
    const e = estados[p.nota.chave]
    if (!e) return []
    return p.nota.itens.filter((i) => {
      const automatico = e.vinculos[chaveDescricao(i.descricao)] && !e.alterar[i.n]
      return !automatico && !rascunhoValido(e.itens[i.n], porId)
    }).map((i) => `${p.nota.numero}:${i.n}`)
  })

  // ---------------------------------------------------------------- 3. importar
  function importar() {
    const escolhas: Record<string, EscolhaNota> = {}
    for (const p of paraImportar) {
      const e = estados[p.nota.chave]
      const decisoes: EscolhaNota["decisoes"] = {}
      for (const i of p.nota.itens) {
        const automatico = e.vinculos[chaveDescricao(i.descricao)] && !e.alterar[i.n]
        const r = e.itens[i.n]
        if (automatico || !r) continue
        decisoes[i.n] = r.tipo === "ignorar" ? { tipo: "ignorar" }
          : r.tipo === "pesagem" ? { tipo: "pesagem", insumoId: r.insumoId }
          : { tipo: "conversao", insumoId: r.insumoId, quantidadePorUnidade: numeroDigitado(r.quantidade), unidade: r.unidade }
      }
      escolhas[p.nota.chave] = { fornecedor: e.fornecedor, decisoes }
    }
    iniciar(async () => {
      try {
        const r = await importarNotas(arquivos.filter((a) => paraImportar.some((p) => p.arquivo === a.nome)), escolhas)
        setResultado(r)
        setLeitura(null)
      } catch {
        setErro("Não foi possível importar. Nada foi perdido: tente de novo.")
      }
    })
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
          <Link href="/pendencias" className={buttonVariants({ variant: "outline", className: "h-10 px-4" })}>Ir para Pendências</Link>
          <Button variant="ghost" className="h-10 px-4" onClick={() => { setResultado(null); setArquivos([]) }}>Importar outras notas</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <label className={cn("grid cursor-pointer place-items-center gap-1 rounded-xl border-2 border-dashed p-6 text-center hover:bg-muted/40", pendente && "opacity-60")}>
        <span className="font-medium">Escolher XML das notas fiscais</span>
        <span className="text-sm text-muted-foreground">Pode selecionar várias de uma vez (até 20). Importando em {casa}.</span>
        <input
          type="file" accept=".xml,text/xml,application/xml" multiple className="sr-only"
          disabled={pendente}
          onChange={(e) => { escolherArquivos(e.target.files); e.target.value = "" }}
        />
      </label>
      {pendente && !leitura ? <p className="text-sm text-muted-foreground">Lendo as notas…</p> : null}
      {erro ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p> : null}

      {leitura?.erros.map((e) => (
        <p key={e.arquivo + e.erro} className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <b>{e.arquivo}</b>: {e.erro}
        </p>
      ))}

      {leitura?.previas.map((p) => {
        const e = estados[p.nota.chave]
        if (!e) return null
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
              {p.jaImportada ? <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Esta nota já foi importada antes e será pulada.</p> : null}
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
                    <span className="text-xs text-muted-foreground">
                      Reconhecido {p.fornecedorSugerido.porDocumento ? "pelo CNPJ" : "pelo nome; confira"}.
                    </span>
                  ) : null}
                </label>

                <ul className="divide-y rounded-lg border">
                  {p.nota.itens.map((item) => {
                    const v = e.vinculos[chaveDescricao(item.descricao)]
                    const automatico = v && !e.alterar[item.n]
                    const r = e.itens[item.n]
                    const ins = r ? porId.get(r.insumoId) : undefined
                    const ok = automatico || rascunhoValido(r, porId)
                    return (
                      <li key={item.n} className="grid gap-2 px-3 py-3 text-sm">
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="font-medium">{item.n}. {item.descricao}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {numero(item.quantidade)} {item.unidade} · {reais(item.valorTotal)}
                          </span>
                        </div>

                        {automatico ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-emerald-800 dark:text-emerald-300">
                              ✓ {v.insumoNome} ·{" "}
                              {v.tipo === "conversao"
                                ? `1 ${item.unidade} = ${numero(v.quantidadePorUnidade)} ${rotuloUnidade(v.unidade)}`
                                : "pesar/contar no recebimento"}
                            </span>
                            <button type="button" className="text-xs text-muted-foreground underline" onClick={() => atualizarNota(p.nota.chave, (x) => ({ ...x, alterar: { ...x.alterar, [item.n]: true } }))}>
                              alterar
                            </button>
                          </div>
                        ) : (
                          <div className={cn("grid gap-2 rounded-md p-2", ok ? "bg-muted/40" : "bg-amber-500/10")}>
                            <div className="flex flex-wrap gap-3">
                              {(["conversao", "pesagem", "ignorar"] as const).map((t) => (
                                <label key={t} className="flex items-center gap-1.5">
                                  <input
                                    type="radio" name={`tipo-${p.nota.chave}-${item.n}`} className="size-4"
                                    checked={(r?.tipo ?? "conversao") === t}
                                    onChange={() => atualizarItem(p.nota.chave, item.n, { tipo: t })}
                                  />
                                  {t === "conversao" ? "Quantidade fixa" : t === "pesagem" ? "Peso variável (pesar no recebimento)" : "Não é insumo (ignorar)"}
                                </label>
                              ))}
                            </div>
                            {(r?.tipo ?? "conversao") !== "ignorar" ? (
                              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                                <Selecao
                                  aria-label="Insumo"
                                  value={r?.insumoId ?? ""}
                                  onChange={(ev) => escolherInsumo(p.nota.chave, item.n, item.unidade, ev.target.value)}
                                >
                                  <option value="" disabled>Qual insumo é este item?</option>
                                  {insumos.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
                                </Selecao>
                                <button
                                  type="button" className="justify-self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
                                  onClick={() => setCadastrando({ chave: p.nota.chave, n: item.n, nome: item.descricao, dimensao: UNIDADE_NOTA_PADRAO[item.unidade]?.dimensao })}
                                >
                                  + Cadastrar novo insumo
                                </button>
                              </div>
                            ) : null}
                            {(r?.tipo ?? "conversao") === "conversao" && ins ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <span>1 {item.unidade} =</span>
                                <Entrada
                                  className="w-24" inputMode="decimal" aria-label="Quantidade por unidade da nota"
                                  value={r?.quantidade ?? ""} placeholder="12"
                                  onChange={(ev) => atualizarItem(p.nota.chave, item.n, { quantidade: ev.target.value })}
                                />
                                <Selecao
                                  className="w-24" aria-label="Unidade" value={r?.unidade ?? ""}
                                  onChange={(ev) => atualizarItem(p.nota.chave, item.n, { unidade: ev.target.value })}
                                >
                                  {UNIDADES_POR_DIMENSAO[ins.dimensao].map((u) => <option key={u.codigo} value={u.codigo}>{u.nome}</option>)}
                                </Selecao>
                                <span className="text-xs text-muted-foreground">ex.: 1 CX = 12 L · 1 KG = 1 kg</span>
                              </div>
                            ) : null}
                            {cadastrando?.chave === p.nota.chave && cadastrando.n === item.n ? (
                              <NovoInsumoRapido
                                categorias={categorias}
                                nomeInicial={cadastrando.nome}
                                dimensaoInicial={cadastrando.dimensao}
                                aoCancelar={() => setCadastrando(null)}
                                aoCriar={aoCriarInsumo}
                              />
                            ) : null}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : null}
          </section>
        )
      })}

      {paraImportar.length ? (
        <div className="sticky bottom-0 grid gap-2 border-t bg-background/95 py-3 backdrop-blur sm:flex sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {pendencias.length
              ? `Falta definir ${pendencias.length} item(ns) para importar.`
              : `Tudo conferido: ${paraImportar.length} nota(s) prontas. Os preços entram validados.`}
          </p>
          <Button className="h-11 px-5" disabled={pendente || pendencias.length > 0} onClick={importar}>
            {pendente ? "Importando…" : `Importar ${paraImportar.length} nota(s)`}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

"use client"

import { useState } from "react"
import { FormAcao, BotaoEnviar, type Acao } from "@/components/form-acao"
import { Campo, Entrada, Selecao } from "@/components/campos"
import { NovoInsumoRapido, type CategoriaOpcao } from "@/components/novo-insumo-rapido"

export type Opcao = { valor: string; nome: string; dimensao: "massa" | "volume" | "contagem"; densidade: boolean }
export type { CategoriaOpcao }

const UNIDADES = {
  massa: [{ c: "g", n: "g" }, { c: "kg", n: "kg" }],
  volume: [{ c: "ml", n: "mL" }, { c: "l", n: "L" }],
  contagem: [{ c: "un", n: "un" }],
} as const

// Massa ↔ volume só aparece quando a densidade do item está validada (o banco exige o mesmo)
function unidadesPara(o: Opcao | undefined) {
  if (!o) return [...UNIDADES.massa, ...UNIDADES.volume, ...UNIDADES.contagem]
  if (o.densidade && o.dimensao !== "contagem") return [...UNIDADES[o.dimensao], ...UNIDADES[o.dimensao === "massa" ? "volume" : "massa"]]
  return [...UNIDADES[o.dimensao]]
}

export function FormComponente({ acao, insumos, subprodutos, etapas, categorias }: {
  acao: Acao; insumos: Opcao[]; subprodutos: Opcao[]; etapas: string[]; categorias: CategoriaOpcao[]
}) {
  const [item, setItem] = useState("")
  const [novos, setNovos] = useState<Opcao[]>([])
  const [cadastrando, setCadastrando] = useState(false)
  const listaInsumos = [...insumos, ...novos.filter((n) => !insumos.some((i) => i.valor === n.valor))]
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  const escolhido = [...listaInsumos, ...subprodutos].find((o) => o.valor === item)
  const unidades = unidadesPara(escolhido)

  return (
    <div className="grid gap-3">
      <FormAcao acao={acao}>
        <Campo rotulo="Insumo ou subproduto">
          <Selecao name="item" required value={item} onChange={(e) => setItem(e.target.value)}>
            <option value="" disabled>Escolha…</option>
            <optgroup label="Insumos">
              {listaInsumos.map((o) => <option key={o.valor} value={o.valor}>{o.nome}</option>)}
            </optgroup>
            {subprodutos.length ? (
              <optgroup label="Subprodutos">
                {subprodutos.map((o) => <option key={o.valor} value={o.valor}>{o.nome}</option>)}
              </optgroup>
            ) : null}
          </Selecao>
        </Campo>
        {!cadastrando ? (
          <button
            type="button"
            onClick={() => setCadastrando(true)}
            className="justify-self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            + Não está na lista? Cadastrar novo insumo
          </button>
        ) : null}
        <div className="grid grid-cols-[1fr_6rem] gap-3 sm:grid-cols-[1fr_1fr_6rem]">
          <Campo rotulo="Etapa" className="col-span-2 sm:col-span-1">
            <Entrada name="etapa" list="etapas" placeholder="limpeza, cocção, montagem…" maxLength={60} />
            <datalist id="etapas">{etapas.map((e) => <option key={e} value={e} />)}</datalist>
          </Campo>
          <Campo rotulo="Quantidade">
            <Entrada name="quantidade" inputMode="decimal" required placeholder="250" />
          </Campo>
          <Campo rotulo="Unidade">
            <Selecao name="unidade" key={item} defaultValue={unidades[0].c} required>
              {unidades.map((u) => <option key={u.c} value={u.c}>{u.n}</option>)}
            </Selecao>
          </Campo>
        </div>
        <Campo rotulo="Observação">
          <Entrada name="observacao" maxLength={200} placeholder="opcional" />
        </Campo>
        <div><BotaoEnviar>Adicionar componente</BotaoEnviar></div>
      </FormAcao>

      {cadastrando ? (
        <NovoInsumoRapido
          categorias={categorias}
          aoCancelar={() => setCadastrando(false)}
          aoCriar={(n) => {
            const opcao: Opcao = { valor: `insumo:${n.id}`, nome: n.nome, dimensao: n.dimensao, densidade: false }
            setNovos((atual) => (atual.some((x) => x.valor === opcao.valor) ? atual : [...atual, opcao]))
            setItem(opcao.valor)
            setCadastrando(false)
          }}
        />
      ) : null}
    </div>
  )
}

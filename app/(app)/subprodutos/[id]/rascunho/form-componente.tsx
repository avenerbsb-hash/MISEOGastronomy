"use client"

import { useActionState, useEffect, useState } from "react"
import { FormAcao, BotaoEnviar, type Acao } from "@/components/form-acao"
import { Campo, Entrada, Selecao } from "@/components/campos"
import { Button } from "@/components/ui/button"
import { criarInsumoRapido, type InsumoNovo } from "@/app/(app)/insumos/actions"

export type Opcao = { valor: string; nome: string; dimensao: "massa" | "volume" | "contagem"; densidade: boolean }
export type CategoriaOpcao = { id: string; nome: string }

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

// Cadastro rápido de insumo sem sair do rascunho (formulário separado: não pode ficar dentro do outro)
function NovoInsumoRapido({ categorias, aoCriar, aoCancelar }: {
  categorias: CategoriaOpcao[]; aoCriar: (i: InsumoNovo) => void; aoCancelar: () => void
}) {
  const [estado, enviar, pendente] = useActionState(criarInsumoRapido, null)
  useEffect(() => {
    if (estado?.novo) aoCriar(estado.novo)
  }, [estado, aoCriar])
  return (
    <form action={enviar} className="grid gap-3 rounded-lg border border-dashed bg-muted/30 p-3">
      <p className="text-sm font-semibold">Cadastrar novo insumo</p>
      <Campo rotulo="Nome do insumo">
        <Entrada name="nome" required maxLength={120} placeholder="Tomate pelado" autoFocus />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Como é medido">
          <Selecao name="dimensao" defaultValue="massa" required>
            <option value="massa">Massa (g, kg)</option>
            <option value="volume">Volume (mL, L)</option>
            <option value="contagem">Unidade (un)</option>
          </Selecao>
        </Campo>
        <Campo rotulo="Categoria">
          <Selecao name="categoria_id" defaultValue="">
            <option value="">Sem categoria</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Selecao>
        </Campo>
      </div>
      <Campo rotulo="Código" dica="Opcional: em branco, o app cria um código.">
        <Entrada name="codigo" maxLength={30} placeholder="automático" />
      </Campo>
      {estado?.erro ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{estado.erro}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        O custo aparece depois que uma compra for registrada e validada na tela do insumo.
      </p>
      <div className="flex gap-2">
        <Button type="submit" disabled={pendente} className="h-10 px-4">{pendente ? "Salvando…" : "Cadastrar e usar"}</Button>
        <Button type="button" variant="ghost" onClick={aoCancelar} className="h-10 px-4">Cancelar</Button>
      </div>
    </form>
  )
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

"use client"

import { useActionState, useEffect, useRef } from "react"
import { Campo, Entrada, Selecao } from "@/components/campos"
import { Button } from "@/components/ui/button"
import { criarInsumoRapido, type InsumoNovo } from "@/app/(app)/insumos/actions"
import type { Dimensao } from "@/lib/formato"

export type CategoriaOpcao = { id: string; nome: string }

// Cadastro rápido de insumo sem sair da tela (é um <form> próprio: não pode ficar dentro de outro form)
export function NovoInsumoRapido({ categorias, aoCriar, aoCancelar, nomeInicial, dimensaoInicial }: {
  categorias: CategoriaOpcao[]
  aoCriar: (i: InsumoNovo) => void
  aoCancelar: () => void
  nomeInicial?: string
  dimensaoInicial?: Dimensao
}) {
  const [estado, enviar, pendente] = useActionState(criarInsumoRapido, null)
  const avisado = useRef<string | null>(null)
  useEffect(() => {
    if (estado?.novo && avisado.current !== estado.novo.id) {
      avisado.current = estado.novo.id
      aoCriar(estado.novo)
    }
  }, [estado, aoCriar])
  return (
    <form action={enviar} className="grid gap-3 rounded-lg border border-dashed bg-muted/30 p-3">
      <p className="text-sm font-semibold">Cadastrar novo insumo</p>
      <Campo rotulo="Nome do insumo">
        <Entrada name="nome" required maxLength={120} placeholder="Tomate pelado" defaultValue={nomeInicial} autoFocus />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Como é medido">
          <Selecao name="dimensao" defaultValue={dimensaoInicial ?? "massa"} required>
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
      <div className="flex gap-2">
        <Button type="submit" disabled={pendente} className="h-10 px-4">{pendente ? "Salvando…" : "Cadastrar e usar"}</Button>
        <Button type="button" variant="ghost" onClick={aoCancelar} className="h-10 px-4">Cancelar</Button>
      </div>
    </form>
  )
}

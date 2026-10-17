"use client"

import { useActionState, useEffect, useState } from "react"
import Link from "next/link"
import { BuscaInsumo } from "@/components/busca-insumo"
import { BotaoEnviar, type Acao } from "@/components/form-acao"
import { Campo, Entrada, Selecao } from "@/components/campos"
import { UNIDADES_POR_DIMENSAO, type Dimensao } from "@/lib/formato"

// Compra sem nota (feira, mercado da esquina): escolhe o insumo, quanto comprou e quanto pagou.
export function CompraAvulsa({ acao, insumos, fornecedores, hoje }: {
  acao: Acao
  insumos: { id: string; nome: string; dimensao: Dimensao }[]
  fornecedores: { id: string; nome: string }[]
  hoje: string
}) {
  const [estado, enviar] = useActionState(acao, null)
  const [insumoId, setInsumoId] = useState("")
  const [form, setForm] = useState(0) // muda a chave para limpar o formulário depois de salvar
  const insumo = insumos.find((i) => i.id === insumoId)
  const unidades = insumo ? UNIDADES_POR_DIMENSAO[insumo.dimensao] : []

  useEffect(() => {
    if (estado?.ok) { setInsumoId(""); setForm((k) => k + 1) }
  }, [estado])

  return (
    <form key={form} action={enviar} className="grid gap-3">
      <input type="hidden" name="insumo_id" value={insumoId} />
      <Campo rotulo="Insumo">
        <BuscaInsumo insumos={insumos} valor={insumoId} aoEscolher={setInsumoId} placeholder="Digite para procurar (ex.: caju)…" />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem_1fr_10rem]">
        <Campo rotulo="Quantidade">
          <Entrada name="quantidade" inputMode="decimal" required placeholder="ex.: 1" disabled={!insumo} />
        </Campo>
        <Campo rotulo="Unidade">
          <Selecao name="unidade" key={insumoId} defaultValue={unidades[0]?.codigo} disabled={!insumo} aria-label="Unidade">
            {unidades.map((u) => <option key={u.codigo} value={u.codigo}>{u.nome}</option>)}
          </Selecao>
        </Campo>
        <Campo rotulo="Valor total pago (R$)">
          <Entrada name="valor_total" inputMode="decimal" required placeholder="ex.: 10,00" disabled={!insumo} />
        </Campo>
        <Campo rotulo="Data da compra">
          <Entrada name="data_compra" type="date" defaultValue={hoje} max={hoje} required />
        </Campo>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Fornecedor, nº da nota e observação (opcional)</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Fornecedor">
            <Selecao name="fornecedor_id" defaultValue="">
              <option value="">Não informado</option>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Nº da nota / cupom"><Entrada name="documento_ref" maxLength={60} /></Campo>
          <Campo rotulo="Observação"><Entrada name="observacao" maxLength={300} placeholder="ex.: comprado na feira" /></Campo>
        </div>
      </details>
      {insumo ? null : (
        <p className="text-xs text-muted-foreground">
          Não achou o insumo? Cadastre em <Link href="/insumos/novo" className="underline">Insumos → Novo insumo</Link>.
        </p>
      )}
      {estado?.erro && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{estado.erro}</p>}
      {estado?.ok && <p role="status" className="rounded-md bg-queda-fundo px-3 py-2 text-sm text-queda">{estado.ok}</p>}
      <div><BotaoEnviar>Lançar compra</BotaoEnviar></div>
    </form>
  )
}

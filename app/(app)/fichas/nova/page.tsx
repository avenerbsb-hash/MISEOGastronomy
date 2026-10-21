import type { Metadata } from "next"
import Link from "next/link"
import { exigirCustos } from "@/lib/sessao"
import { categorias, nomesCategorias } from "@/lib/dados"
import { FormAcao, BotaoEnviar } from "@/components/form-acao"
import { Campo, Entrada, Selecao } from "@/components/campos"
import { criarFicha } from "../actions"

export const metadata: Metadata = { title: "Nova ficha técnica" }

// Nova ficha técnica do cardápio: cria a ficha e a versão 1 em rascunho; os ingredientes são montados no editor
export default async function NovaFicha() {
  const s = await exigirCustos()
  const cats = await categorias("receita")
  const nomes = nomesCategorias(cats)
  const finais = cats.filter((c) => (nomes.get(c.id) ?? "").startsWith("Fichas finais ›"))
  return (
    <div className="grid max-w-xl gap-4">
      <div>
        <div className="mb-2 text-sm"><Link href="/fichas" className="text-muted-foreground hover:underline">← Fichas técnicas</Link></div>
        <h1 className="text-xl font-semibold">Nova ficha técnica</h1>
        <p className="text-sm text-muted-foreground">Prato, petisco, drink ou sobremesa. Depois de criar, monte os ingredientes e o modo de preparo e aprove.</p>
      </div>
      <FormAcao acao={criarFicha} limparAoSalvar={false}>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <Campo rotulo="Código" dica="Em branco: gerado sozinho."><Entrada name="codigo" maxLength={30} placeholder="FT-001" /></Campo>
          <Campo rotulo="Nome"><Entrada name="nome" required maxLength={120} placeholder="ex.: Picanha completa" /></Campo>
        </div>
        <Campo rotulo="Categoria">
          <Selecao name="categoria_id" defaultValue="">
            <option value="">Sem categoria</option>
            {finais.map((c) => <option key={c.id} value={c.id}>{(nomes.get(c.id) ?? c.nome).replace("Fichas finais › ", "")}</option>)}
          </Selecao>
        </Campo>
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <Campo rotulo="Rende (porções)"><Entrada name="porcoes" inputMode="decimal" required defaultValue="1" /></Campo>
          <Campo rotulo="Descrição da porção (opcional)"><Entrada name="porcao" maxLength={80} placeholder="ex.: 1 prato (450 g)" /></Campo>
        </div>
        <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          <input type="checkbox" name="exclusiva" defaultChecked className="mt-0.5 size-4" />
          <span>
            <b>Só desta casa ({s.casa.nome})</b>
            <span className="block text-xs text-muted-foreground">As outras casas não veem esta ficha. Desmarque para compartilhar com todas as casas.</span>
          </span>
        </label>
        <div><BotaoEnviar className="h-11 px-5" enviando="Criando…">Criar e montar a ficha</BotaoEnviar></div>
      </FormAcao>
    </div>
  )
}

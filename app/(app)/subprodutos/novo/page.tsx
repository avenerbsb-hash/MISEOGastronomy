import type { Metadata } from "next"
import { exigirCustos } from "@/lib/sessao"
import { categorias, nomesCategorias } from "@/lib/dados"
import { FormAcao, BotaoEnviar } from "@/components/form-acao"
import { Campo, Entrada, Selecao } from "@/components/campos"
import { criarSubproduto } from "../actions"

export const metadata: Metadata = { title: "Novo preparo" }

export default async function NovoSubproduto() {
  await exigirCustos()
  const cats = await categorias("receita")
  const nomes = nomesCategorias(cats)
  return (
    <div className="grid max-w-xl gap-4">
      <div>
        <h1 className="text-xl font-semibold">Novo preparo ou base</h1>
        <p className="text-sm text-muted-foreground">Molhos, bases, carnes limpas… Depois de criar, monte a receita no rascunho.</p>
      </div>
      <FormAcao acao={criarSubproduto} limparAoSalvar={false}>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <Campo rotulo="Código"><Entrada name="codigo" required maxLength={30} placeholder="SUB-001" /></Campo>
          <Campo rotulo="Nome"><Entrada name="nome" required maxLength={120} placeholder="Molho de tomate" /></Campo>
        </div>
        <Campo rotulo="Categoria">
          <Selecao name="categoria_id" defaultValue="">
            <option value="">Sem categoria</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{nomes.get(c.id)}</option>)}
          </Selecao>
        </Campo>
        <Campo rotulo="Rendimento medido em" dica="Define em que unidade o custo do subproduto é calculado (R$/kg, R$/L ou R$/un).">
          <Selecao name="dimensao_saida" defaultValue="massa">
            <option value="massa">Massa (g, kg)</option>
            <option value="volume">Volume (mL, L)</option>
            <option value="contagem">Unidade (un)</option>
          </Selecao>
        </Campo>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Campo rotulo="Rendimento padrão"><Entrada name="rendimento_quantidade" inputMode="decimal" required placeholder="2,5" /></Campo>
          <Campo rotulo="Unidade">
            <Selecao name="rendimento_unidade" defaultValue="kg">
              <option value="kg">kg</option><option value="g">g</option>
              <option value="l">L</option><option value="ml">mL</option>
              <option value="un">un</option>
            </Selecao>
          </Campo>
        </div>
        <div><BotaoEnviar>Criar e montar a receita</BotaoEnviar></div>
      </FormAcao>
    </div>
  )
}

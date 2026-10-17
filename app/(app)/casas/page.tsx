import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { inicioDoPapel, obterSessao } from "@/lib/sessao"
import { dataCurta, percentual } from "@/lib/formato"
import { FormAcao, BotaoEnviar } from "@/components/form-acao"
import { Campo, Entrada, Selecao } from "@/components/campos"
import { REGRAS } from "@/lib/regras-preco"
import { cn } from "@/lib/utils"
import { alternarCasa, criarCasa, editarCasa } from "./actions"

export const metadata: Metadata = { title: "Casas" }

type CasaAdmin = {
  id: string; nome: string; marca: string | null; ativo: boolean; cmv_alvo: number | null; regra: string; criado_em: string
  pessoas: number; itens_cardapio: number; compras: number; referencias: number
}

// Casas (só administrador): cadastrar casa nova, renomear e ativar/desativar
export default async function Casas() {
  const s = await obterSessao()
  if (!s.casa) redirect("/sem-acesso")
  if (!s.admin) redirect(inicioDoPapel(s))
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("listar_casas_admin")
  const casas = (data ?? []) as CasaAdmin[]
  const ativas = casas.filter((c) => c.ativo && c.nome !== "Casa Demo")
  const regra = (v: string) => REGRAS.find((r) => r.valor === v)?.rotulo.split(" (")[0] ?? v

  return (
    <div className="grid max-w-5xl gap-5">
      <div>
        <h1 className="text-xl font-semibold">Casas</h1>
        <p className="text-sm text-muted-foreground">
          Cadastre uma casa nova em poucos passos. Depois, dê acesso às pessoas em <Link href="/usuarios" className="underline">Usuários</Link> e
          importe as notas em <Link href="/pendencias/notas" className="underline">Compras → Importar notas</Link>.
        </p>
      </div>

      {error ? <p className="rounded-lg bg-alta-fundo px-3 py-2 text-sm text-alta">O cadastro de casas ainda não está ativo (migração 0028).</p> : (
        <>
          <section className="grid gap-3 rounded-xl border p-4">
            <h2 className="text-base font-semibold">Nova casa</h2>
            <FormAcao acao={criarCasa}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Nome da casa"><Entrada name="nome" required maxLength={80} placeholder="ex.: Giuli Asa Sul" /></Campo>
                <Campo rotulo="Marca ou grupo (opcional)"><Entrada name="marca" maxLength={80} placeholder="ex.: Grupo JF+" /></Campo>
                <Campo rotulo="Meta de CMV (%)" dica="O CMV acima dela fica vermelho no painel e nos alertas.">
                  <Entrada name="meta" required inputMode="decimal" defaultValue="30" />
                </Campo>
                <Campo rotulo="Arredondamento do preço sugerido">
                  <Selecao name="regra" defaultValue="centavos">{REGRAS.map((r) => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}</Selecao>
                </Campo>
                <Campo rotulo="Preços de referência (opcional)"
                  dica="Copia o último preço de cada insumo de outra casa, marcado como referência até a primeira compra desta casa. Assim as fichas já têm custo no primeiro dia.">
                  <Selecao name="precos_de" defaultValue="">
                    <option value="">Não copiar (começa sem preços)</option>
                    {ativas.map((c) => <option key={c.id} value={c.id}>Copiar de {c.nome}</option>)}
                  </Selecao>
                </Campo>
                <Campo rotulo="Cardápio (opcional)"
                  dica="Copia os cardápios de outra casa (seções e fichas). Os preços de venda não são copiados: cada casa define os seus.">
                  <Selecao name="cardapio_de" defaultValue="">
                    <option value="">Começar com o cardápio vazio</option>
                    {ativas.map((c) => <option key={c.id} value={c.id}>Copiar de {c.nome} ({c.itens_cardapio} itens)</option>)}
                  </Selecao>
                </Campo>
              </div>
              <div><BotaoEnviar className="h-11 px-5" enviando="Criando casa…">Criar casa</BotaoEnviar></div>
            </FormAcao>
          </section>

          <section className="grid gap-2">
            <h2 className="text-base font-semibold">Casas cadastradas</h2>
            <ul className="grid gap-3">
              {casas.map((c) => (
                <li key={c.id} className={cn("grid gap-3 rounded-xl border p-4", !c.ativo && "bg-muted/40")}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {c.nome}
                        {c.ativo ? null : <span className="ml-2 rounded-full bg-neutro-fundo px-2 py-0.5 text-xs font-semibold text-neutro">desativada</span>}
                        {c.id === s.casa!.id ? <span className="ml-2 rounded-full bg-queda-fundo px-2 py-0.5 text-xs font-semibold text-queda">aberta agora</span> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.marca ? `${c.marca} · ` : ""}desde {dataCurta(c.criado_em)} · meta de CMV {percentual(c.cmv_alvo ?? 30)} · arredondamento {regra(c.regra)}
                      </p>
                    </div>
                    <form action={alternarCasa}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="min-h-9 rounded-lg border px-3 text-sm hover:bg-muted">{c.ativo ? "Desativar" : "Reativar"}</button>
                    </form>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <Numero rotulo="pessoas com acesso" valor={c.pessoas} />
                    <Numero rotulo="itens no cardápio" valor={c.itens_cardapio} />
                    <Numero rotulo="compras registradas" valor={c.compras} />
                    <Numero rotulo="preços de referência" valor={c.referencias} />
                  </div>
                  <details>
                    <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Renomear</summary>
                    <FormAcao acao={editarCasa} limparAoSalvar={false} className="mt-2">
                      <input type="hidden" name="id" value={c.id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Campo rotulo="Nome"><Entrada name="nome" required maxLength={80} defaultValue={c.nome} /></Campo>
                        <Campo rotulo="Marca ou grupo"><Entrada name="marca" maxLength={80} defaultValue={c.marca ?? ""} /></Campo>
                      </div>
                      <div><BotaoEnviar className="h-10">Salvar</BotaoEnviar></div>
                    </FormAcao>
                  </details>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Desativar não apaga nada: a casa some das listas e do seletor do topo, e pode ser reativada aqui.</p>
          </section>
        </>
      )}
    </div>
  )
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <span className="block text-lg font-semibold tabular-nums">{valor}</span>
      <span className="block text-xs text-muted-foreground">{rotulo}</span>
    </div>
  )
}

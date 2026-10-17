import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { inicioDoPapel, obterSessao } from "@/lib/sessao"
import { dataHora } from "@/lib/formato"
import { FormAcao, BotaoEnviar } from "@/components/form-acao"
import { Campo, Entrada, Selecao } from "@/components/campos"
import { cn } from "@/lib/utils"
import { alternarUsuario, criarUsuario, salvarNiveis } from "./actions"

export const metadata: Metadata = { title: "Usuários" }

const NIVEIS = [
  { valor: 1, papel: "contagem", nome: "1 · Contagem", descricao: "Só a contagem de estoque." },
  { valor: 2, papel: "estoquista", nome: "2 · Estoque", descricao: "Contagem + pedido da semana e estoque (sem R$)." },
  { valor: 3, papel: "gerente", nome: "3 · Gerência", descricao: "Estoque + painel de CMV, preço das fichas e estoque mínimo." },
  { valor: 4, papel: "gestor", nome: "4 · Proprietário", descricao: "Tudo na casa." },
] as const
const NIVEL_DO_PAPEL: Record<string, number> = { contagem: 1, estoquista: 2, gerente: 3, gestor: 4 }

type Usuario = {
  user_id: string; nome: string; email: string | null; admin: boolean; ativo: boolean; ultimo_acesso: string | null
  acessos: { estab: string; papel: string }[]
}

// Usuários (só administrador): criar login, nível por casa, ativar/desativar
export default async function Usuarios() {
  const s = await obterSessao()
  if (!s.casa) redirect("/sem-acesso")
  if (!s.admin) redirect(inicioDoPapel(s))
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("listar_usuarios_miseo")
  const usuarios = (data ?? []) as Usuario[]

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-xl font-semibold">Usuários</h1>
        <p className="text-sm text-muted-foreground">Crie logins e defina o nível de acesso de cada pessoa em cada casa. Cada nível inclui o anterior.</p>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {NIVEIS.map((n) => (
          <li key={n.valor} className="rounded-xl border px-3 py-2.5">
            <div className="font-semibold">{n.nome}</div>
            <div className="text-sm text-muted-foreground">{n.descricao}</div>
          </li>
        ))}
      </ul>

      <section className="grid gap-3 rounded-xl border p-4">
        <h2 className="text-base font-semibold">Novo usuário</h2>
        <FormAcao acao={criarUsuario} className="gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome"><Entrada name="nome" required maxLength={80} placeholder="ex.: Éder Henrique Leonel Cardoso" className="h-11" /></Campo>
            <Campo rotulo="E-mail (login)"><Entrada name="email" type="email" required autoComplete="off" className="h-11" /></Campo>
            <Campo rotulo="Senha provisória (mínimo 8 caracteres)"><Entrada name="senha" type="password" required minLength={8} autoComplete="new-password" className="h-11" /></Campo>
            <Campo rotulo="Casa">
              <Selecao name="casa" defaultValue={s.casa.id} className="h-11">
                {s.casas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                <option value="todas">Todas as casas</option>
              </Selecao>
            </Campo>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Nível de acesso</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {NIVEIS.map((n) => (
                <label key={n.valor} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 has-[:checked]:border-foreground has-[:checked]:bg-muted">
                  <input type="radio" name="nivel" value={n.valor} required defaultChecked={n.valor === 1} className="mt-1" />
                  <span><span className="block text-sm font-medium">{n.nome}</span><span className="block text-xs text-muted-foreground">{n.descricao}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <div><BotaoEnviar className="h-11 px-5" enviando="Criando…">Criar usuário</BotaoEnviar></div>
        </FormAcao>
      </section>

      <section className="grid gap-2">
        <h2 className="text-base font-semibold">Usuários cadastrados</h2>
        {error ? <p className="text-sm text-muted-foreground">A lista de usuários depende da migração 0022.</p> : (
          <ul className="divide-y rounded-xl border">
            {usuarios.map((u) => {
              const nivelEm = new Map(u.acessos.map((a) => [a.estab, NIVEL_DO_PAPEL[a.papel] ?? 0]))
              return (
                <li key={u.user_id} className={cn("grid gap-2 px-3 py-3", !u.ativo && "bg-muted/40 text-muted-foreground")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{u.nome}{u.admin ? <span className="ml-2 rounded-full bg-foreground px-2 py-0.5 text-xs text-background">Administrador</span> : null}{!u.ativo ? " · desativado" : ""}</div>
                      <div className="truncate text-xs text-muted-foreground">{u.email ?? "—"} · último acesso {u.ultimo_acesso ? dataHora(u.ultimo_acesso) : "nunca"}</div>
                    </div>
                    {!u.admin && u.user_id !== s.userId ? (
                      <FormAcao acao={alternarUsuario.bind(null, u.user_id, u.nome, !u.ativo)} className="gap-1">
                        <BotaoEnviar variant="ghost" className="h-10 px-3 text-xs" enviando="…">{u.ativo ? "Desativar" : "Ativar"}</BotaoEnviar>
                      </FormAcao>
                    ) : null}
                  </div>
                  {u.admin ? <p className="text-xs text-muted-foreground">Administrador: acesso completo a todas as casas.</p> : (
                    <FormAcao acao={salvarNiveis.bind(null, u.user_id)} limparAoSalvar={false} className="gap-2">
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {s.casas.map((c) => (
                          <label key={c.id} className="grid gap-1 text-xs text-muted-foreground">{c.nome}
                            <Selecao name={`nivel_${c.id}`} defaultValue={String(nivelEm.get(c.id) ?? 0)} className="h-10 text-sm">
                              <option value="0">Sem acesso</option>
                              {NIVEIS.map((n) => <option key={n.valor} value={n.valor}>{n.nome}</option>)}
                            </Selecao>
                          </label>
                        ))}
                      </div>
                      <div><BotaoEnviar variant="outline" className="h-10 px-4">Salvar acessos</BotaoEnviar></div>
                    </FormAcao>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

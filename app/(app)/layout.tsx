import { obterSessao, podeVerCustos } from "@/lib/sessao"
import { createClient } from "@/lib/supabase/server"
import { SeletorCasa } from "@/components/seletor-casa"
import { MenuCelular, MenuLateral, type ItemMenu } from "@/components/navegacao"
import { sair } from "./actions"
import { LogoCasa } from "@/components/logo-casa"

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const s = await obterSessao()
  const custos = podeVerCustos(s)
  // compras esperando conferência na casa (número no menu)
  let conferir = 0
  if (custos && s.casa) {
    const supabase = await createClient()
    const { count } = await supabase.from("conferencias_preco").select("id", { count: "exact", head: true })
      .eq("estabelecimento_id", s.casa.id).eq("status", "aberta")
    conferir = count ?? 0
  }
  // ordem do dia a dia: resumo, cardápio e fichas, depois cadastro e compras
  const itens: ItemMenu[] = custos
    ? [
        { href: "/inicio", rotulo: "Início" },
        { href: "/cmv", rotulo: "CMV" },
        { href: "/fichas", rotulo: "Fichas técnicas" },
        { href: "/subprodutos", rotulo: "Preparos e bases" },
        { href: "/insumos", rotulo: "Insumos" },
        { href: "/pendencias", rotulo: "Compras", contador: conferir },
        { href: "/estoque", rotulo: "Estoque" },
        { href: "/alertas", rotulo: "Alertas" },
        { href: "/casa", rotulo: "Dados da casa" },
      ]
    : s.papel === "contagem" ? [{ href: "/estoque/contagem", rotulo: "Contagem" }]
    : s.papel === "estoquista" ? [{ href: "/estoque", rotulo: "Estoque" }]
    : [{ href: "/subprodutos", rotulo: "Preparos e bases" }, { href: "/fichas", rotulo: "Fichas técnicas" }]

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur print:hidden">
        <div className="flex h-14 items-center gap-2 px-2 sm:px-4">
          {s.casa ? <MenuCelular itens={itens} /> : null}
          {s.casa?.logo ? <LogoCasa url={s.casa.logo} nome={s.casa.nome} className="h-9 rounded" /> : <span className="hidden font-semibold tracking-wide sm:inline">MISEO</span>}
          {s.casa ? <SeletorCasa casas={s.casas} atual={s.casa.id} /> : null}
          <form action={sair} className="ml-auto">
            <button type="submit" className="min-h-11 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted" title={s.email}>
              Sair
            </button>
          </form>
        </div>
      </header>
      <div className="flex">
        {s.casa ? <MenuLateral itens={itens} /> : null}
        <main className="min-w-0 flex-1 px-3 py-4 sm:px-6 print:p-0">
          {s.casa ? (
            children
          ) : (
            <div className="mx-auto max-w-md rounded-xl border p-6 text-sm">
              <h1 className="mb-2 text-base font-semibold">Sem acesso a nenhuma casa</h1>
              <p className="text-muted-foreground">
                Seu usuário ({s.email}) ainda não tem perfil ativo ou acesso a uma casa. Peça ao administrador para
                liberar o seu acesso.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

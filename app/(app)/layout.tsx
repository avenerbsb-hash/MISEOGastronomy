import { obterSessao, podeVerCustos } from "@/lib/sessao"
import { createClient } from "@/lib/supabase/server"
import { SeletorCasa } from "@/components/seletor-casa"
import { Menu } from "@/components/menu"
import { sair } from "./actions"

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
  const itens = custos
    ? [
        { href: "/inicio", rotulo: "Início" },
        { href: "/cmv", rotulo: "CMV" },
        { href: "/fichas", rotulo: "Fichas" },
        { href: "/subprodutos", rotulo: "Subprodutos" },
        { href: "/insumos", rotulo: "Insumos" },
        { href: "/pendencias", rotulo: "Compras", contador: conferir },
        { href: "/alertas", rotulo: "Alertas" },
      ]
    : [{ href: "/subprodutos", rotulo: "Subprodutos" }, { href: "/fichas", rotulo: "Fichas" }]

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <span className="font-semibold tracking-wide">MISEO</span>
          {s.casa ? <SeletorCasa casas={s.casas} atual={s.casa.id} /> : null}
          <form action={sair} className="ml-auto">
            <button type="submit" className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted" title={s.email}>
              Sair
            </button>
          </form>
        </div>
        {s.casa ? (
          <div className="mx-auto max-w-6xl px-3 pb-2">
            <Menu itens={itens} />
          </div>
        ) : null}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-4 print:max-w-none print:p-0">
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
  )
}

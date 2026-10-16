import { obterSessao, podeVerCustos } from "@/lib/sessao"
import { SeletorCasa } from "@/components/seletor-casa"
import { Menu } from "@/components/menu"
import { sair } from "./actions"

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const s = await obterSessao()
  const itens = podeVerCustos(s)
    ? [
        { href: "/insumos", rotulo: "Insumos" },
        { href: "/pendencias", rotulo: "Pendências" },
        { href: "/subprodutos", rotulo: "Subprodutos" },
        { href: "/fichas", rotulo: "Fichas" },
        { href: "/cmv", rotulo: "CMV" },
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

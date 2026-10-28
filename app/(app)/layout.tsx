import { ehGestor, obterSessao, podeVerCustos } from "@/lib/sessao"
import { createClient } from "@/lib/supabase/server"
import { SeletorCasa } from "@/components/seletor-casa"
import { MenuCelular, MenuLateral, type ItemMenu } from "@/components/navegacao"
import { aceitarTermos, sair } from "./actions"
import { AceiteTermos } from "@/components/aceite-termos"
import { VERSAO_TERMOS } from "@/lib/empresa"
import { LogoCasa } from "@/components/logo-casa"

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const s = await obterSessao()
  const supabase = await createClient()
  const custos = podeVerCustos(s)
  // as três leituras do menu saem juntas
  const [aceite, conferencias, contagem] = await Promise.all([
    // aceite dos Termos e da Privacidade (0029); sem a migração, segue sem pedir
    supabase.from("aceites_termos").select("id").eq("user_id", s.userId).eq("versao", VERSAO_TERMOS).limit(1),
    // compras esperando conferência na casa (número no menu)
    custos && s.casa
      ? supabase.from("conferencias_preco").select("id", { count: "exact", head: true }).eq("estabelecimento_id", s.casa.id).eq("status", "aberta")
      : null,
    // pedido da última contagem ainda não emitido (0027): aviso no ícone de Estoque
    s.casa && (ehGestor(s) || s.papel === "gerente" || s.papel === "estoquista")
      ? supabase.from("contagens_estoque").select("pedido_emitido_em")
          .eq("estabelecimento_id", s.casa.id).order("data", { ascending: false }).order("criado_em", { ascending: false }).limit(1)
      : null,
  ])
  if (!aceite.error && !aceite.data?.length) return <AceiteTermos nome={s.nome} acao={aceitarTermos} sair={sair} />
  const conferir = conferencias?.count ?? 0
  const pedidoPendente = contagem && !contagem.error && contagem.data?.length && !contagem.data[0].pedido_emitido_em ? 1 : 0
  const avisoEstoque = "pedido da última contagem para emitir"
  // ordem do dia a dia: resumo, cardápio e fichas, depois cadastro e compras
  const itens: ItemMenu[] = ehGestor(s)
    ? [
        { href: "/inicio", rotulo: "Início" },
        { href: "/cmv", rotulo: "CMV" },
        { href: "/fichas", rotulo: "Fichas técnicas" },
        { href: "/subprodutos", rotulo: "Preparos e bases" },
        { href: "/insumos", rotulo: "Insumos" },
        { href: "/pendencias", rotulo: "Compras", contador: conferir, aviso: "compras para conferir" },
        { href: "/estoque", rotulo: "Estoque", contador: pedidoPendente, aviso: avisoEstoque },
        { href: "/alertas", rotulo: "Alertas" },
        { href: "/casa", rotulo: "Dados da casa" },
        ...(s.admin ? [{ href: "/casas", rotulo: "Casas" }, { href: "/usuarios", rotulo: "Usuários" }] : []),
      ]
    : s.papel === "gerente" ? [{ href: "/cmv", rotulo: "CMV" }, { href: "/fichas", rotulo: "Fichas técnicas" }, { href: "/estoque", rotulo: "Estoque", contador: pedidoPendente, aviso: avisoEstoque }]
    : s.papel === "contagem" ? [{ href: "/estoque/contagem", rotulo: "Contagem" }]
    : s.papel === "estoquista" ? [{ href: "/estoque", rotulo: "Estoque", contador: pedidoPendente, aviso: avisoEstoque }]
    : [{ href: "/subprodutos", rotulo: "Preparos e bases" }, { href: "/fichas", rotulo: "Fichas técnicas" }]

  return (
    <div className="flex min-h-dvh">
      {s.casa ? <MenuLateral itens={itens} /> : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur print:hidden">
          <div className="flex h-14 items-center gap-2 px-2 sm:px-4">
            {s.casa ? <MenuCelular itens={itens} /> : null}
            {s.casa?.logo ? <LogoCasa url={s.casa.logo} nome={s.casa.nome} className="h-9 rounded" />
              : <span className={s.casa ? "hidden font-semibold tracking-wide sm:inline md:hidden" : "font-semibold tracking-wide"}>MISEO</span>}
            {s.casa ? <SeletorCasa casas={s.casas} atual={s.casa.id} /> : null}
            <form action={sair} className="ml-auto">
              <button type="submit" className="min-h-11 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted" title={s.email}>
                Sair
              </button>
            </form>
          </div>
        </header>
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

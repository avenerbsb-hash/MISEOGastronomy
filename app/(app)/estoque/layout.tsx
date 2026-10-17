import { redirect } from "next/navigation"
import { exigirCasa, podeVerCustos } from "@/lib/sessao"
import { Abas } from "@/components/abas"

export default async function LayoutEstoque({ children }: { children: React.ReactNode }) {
  const s = await exigirCasa()
  if (s.papel === "producao") redirect("/subprodutos")
  // quem só conta vê só a contagem
  if (s.papel === "contagem") return <div><h1 className="mb-3 text-xl font-semibold">Contagem de estoque</h1>{children}</div>
  const abas = [
    { href: "/estoque", rotulo: "Pedido da semana" },
    { href: "/estoque/contagem", rotulo: "Contagem" },
    ...(podeVerCustos(s) ? [{ href: "/estoque/itens", rotulo: "Itens e mínimos" }] : []),
  ]
  return (
    <div>
      <h1 className="mb-3 text-xl font-semibold">Estoque</h1>
      <Abas itens={abas} />
      {children}
    </div>
  )
}

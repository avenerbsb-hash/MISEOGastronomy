import { redirect } from "next/navigation"
import { obterSessao, podeVerCustos } from "@/lib/sessao"

export default async function Inicio() {
  const s = await obterSessao()
  redirect(podeVerCustos(s) ? "/insumos" : "/subprodutos")
}

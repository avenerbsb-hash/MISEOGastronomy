import { redirect } from "next/navigation"
import { inicioDoPapel, obterSessao } from "@/lib/sessao"

export default async function Inicio() {
  const s = await obterSessao()
  redirect(inicioDoPapel(s))
}

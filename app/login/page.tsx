import type { Metadata } from "next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FormAcao, BotaoEnviar } from "@/components/form-acao"
import { Campo, Entrada } from "@/components/campos"
import Link from "next/link"
import { entrar } from "./actions"
import { destinoLogin } from "@/lib/destino-login"

export const metadata: Metadata = { title: "Entrar" }

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const destino = destinoLogin((await searchParams).next)
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl">MISEO</CardTitle>
          <CardDescription>Fichas técnicas e CMV do Grupo JF+</CardDescription>
        </CardHeader>
        <CardContent>
          <FormAcao acao={entrar} limparAoSalvar={false}>
            <input type="hidden" name="next" value={destino} />
            <Campo rotulo="E-mail">
              <Entrada name="email" type="email" autoComplete="username" required />
            </Campo>
            <Campo rotulo="Senha">
              <Entrada name="senha" type="password" autoComplete="current-password" required />
            </Campo>
            <BotaoEnviar className="w-full" enviando="Entrando…">Entrar</BotaoEnviar>
          </FormAcao>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            <Link href="/termos" className="underline">Termos de Uso</Link> · <Link href="/privacidade" className="underline">Política de Privacidade</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}

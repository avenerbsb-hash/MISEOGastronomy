import type { Metadata } from "next"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FormAcao, BotaoEnviar } from "@/components/form-acao"
import { Campo, Entrada } from "@/components/campos"
import { entrar } from "./actions"

export const metadata: Metadata = { title: "Entrar" }

export default function PaginaLogin() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl">MISEO</CardTitle>
          <CardDescription>Fichas técnicas e CMV do Grupo JF+</CardDescription>
        </CardHeader>
        <CardContent>
          <FormAcao acao={entrar} limparAoSalvar={false}>
            <Campo rotulo="E-mail">
              <Entrada name="email" type="email" autoComplete="username" required />
            </Campo>
            <Campo rotulo="Senha">
              <Entrada name="senha" type="password" autoComplete="current-password" required />
            </Campo>
            <BotaoEnviar className="w-full">Entrar</BotaoEnviar>
          </FormAcao>
        </CardContent>
      </Card>
    </main>
  )
}

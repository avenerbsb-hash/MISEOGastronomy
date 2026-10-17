import Link from "next/link"
import { FormAcao, BotaoEnviar, type Acao } from "@/components/form-acao"
import { EMPRESA } from "@/lib/empresa"

// Tela de aceite no primeiro acesso (e quando a versão dos documentos muda)
export function AceiteTermos({ nome, acao, sair }: { nome: string; acao: Acao; sair: () => Promise<void> }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg items-center px-4">
      <div className="grid w-full gap-4 rounded-xl border bg-card p-6 shadow-sm">
        <p className="text-sm font-semibold tracking-[0.2em]">{EMPRESA.marca}</p>
        <h1 className="text-xl font-semibold">Antes de começar, {nome.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">
          Leia e aceite os documentos abaixo para usar o sistema. Eles explicam como o {EMPRESA.marca} funciona e como
          cuidamos dos seus dados (LGPD).
        </p>
        <ul className="grid gap-2 text-sm">
          <li><Link href="/termos" target="_blank" className="font-medium underline">Termos de Uso</Link> <span className="text-muted-foreground">(abre em outra aba)</span></li>
          <li><Link href="/privacidade" target="_blank" className="font-medium underline">Política de Privacidade</Link> <span className="text-muted-foreground">(abre em outra aba)</span></li>
        </ul>
        <FormAcao acao={acao} limparAoSalvar={false}>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="aceito" required className="mt-0.5 size-4" />
            <span>Li e aceito os Termos de Uso e a Política de Privacidade.</span>
          </label>
          <BotaoEnviar className="h-11 w-full" enviando="Registrando…">Aceitar e entrar</BotaoEnviar>
        </FormAcao>
        <form action={sair}>
          <button type="submit" className="text-sm text-muted-foreground underline">Não aceito — sair</button>
        </form>
      </div>
    </main>
  )
}

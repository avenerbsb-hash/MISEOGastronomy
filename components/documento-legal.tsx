import Link from "next/link"
import { EMPRESA, VIGENCIA_TERMOS } from "@/lib/empresa"

// Página pública dos documentos legais (abre sem login)
export function DocumentoLegal({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-10 text-[15px] leading-relaxed">
      <header className="grid gap-1 border-b pb-4">
        <p className="text-sm font-semibold tracking-[0.2em]">{EMPRESA.marca}</p>
        <h1 className="text-2xl font-semibold">{titulo}</h1>
        <p className="text-sm text-muted-foreground">Vigente desde {VIGENCIA_TERMOS}</p>
        <nav className="mt-2 flex gap-4 text-sm">
          <Link href="/termos" className="underline">Termos de Uso</Link>
          <Link href="/privacidade" className="underline">Política de Privacidade</Link>
          <Link href="/" className="underline">Voltar ao sistema</Link>
        </nav>
      </header>
      <div className="grid gap-5 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:grid [&_ul]:gap-1">{children}</div>
    </main>
  )
}

// Dado da empresa ainda não preenchido aparece destacado
export function Dado({ v }: { v: string }) {
  return v.startsWith("[") ? <mark className="rounded bg-amber-200 px-1">{v}</mark> : <>{v}</>
}

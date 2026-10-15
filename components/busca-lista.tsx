import Link from "next/link"
import { Entrada } from "@/components/campos"
import { Button, buttonVariants } from "@/components/ui/button"

// Busca por nome ou código nas listas (GET ?q=); "manter" preserva outros parâmetros, como a ordenação
export function BuscaLista({ q, placeholder, manter }: { q: string; placeholder: string; manter?: Record<string, string> }) {
  const limpar = manter ? `?${new URLSearchParams(manter)}` : "?"
  return (
    <form className="flex gap-2" role="search">
      <Entrada name="q" defaultValue={q} placeholder={placeholder} aria-label="Buscar" className="flex-1" />
      {Object.entries(manter ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Button type="submit" variant="outline" className="h-10 px-4">Buscar</Button>
      {q ? <Link href={limpar} className={buttonVariants({ variant: "ghost", className: "h-10 px-3" })}>Limpar</Link> : null}
    </form>
  )
}

// Logo da casa (Dados da casa → Logo); sem logo, não mostra nada
export function LogoCasa({ url, nome, className = "h-8" }: { url: string | null | undefined; nome: string; className?: string }) {
  if (!url) return null
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={`Logo de ${nome}`} className={`w-auto max-w-[10rem] object-contain ${className}`} />
}

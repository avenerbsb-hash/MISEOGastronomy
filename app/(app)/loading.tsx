// Aparece na hora ao trocar de tela, enquanto o servidor busca os dados
export default function Carregando() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-10 w-full max-w-md animate-pulse rounded-md bg-muted" />
      <div className="grid gap-2 rounded-xl border p-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-5 animate-pulse rounded bg-muted" style={{ width: `${90 - (i % 3) * 15}%` }} />
        ))}
      </div>
    </div>
  )
}

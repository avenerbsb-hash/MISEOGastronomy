// Aceita apenas caminhos locais; o destino vem da URL e pode ser adulterado.
export function destinoLogin(valor: unknown): string {
  if (typeof valor !== "string" || !valor.startsWith("/") || valor.startsWith("//")) return "/"
  if (/[\\\u0000-\u0020\u007f]/.test(valor)) return "/"
  const base = "https://miseo.invalid"
  try {
    const url = new URL(valor, base)
    if (url.origin !== base || /^\/login(?:\/|$)/.test(url.pathname)) return "/"
    return url.pathname + url.search + url.hash
  } catch {
    return "/"
  }
}

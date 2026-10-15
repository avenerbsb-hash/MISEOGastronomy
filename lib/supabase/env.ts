// Só a URL e a chave publishable (pública). A chave secreta nunca entra no app.
export function supabaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!v) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL no .env.local (veja .env.example)")
  return v
}

export function supabaseKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!v) throw new Error("Defina NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no .env.local (veja .env.example)")
  return v
}

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { supabaseUrl, supabaseKey } from "./env"

// Cliente do Supabase para Server Components e Server Actions (sessão do usuário via cookies)
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Chamado de um Server Component: o middleware já renova a sessão
        }
      },
    },
  })
}

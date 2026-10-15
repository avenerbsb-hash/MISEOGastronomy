import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// As variáveis NEXT_PUBLIC_* são gravadas no app no momento do build:
// depois de criar ou corrigir na Vercel, é preciso publicar de novo (Redeploy).
const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const CHAVE_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

function paginaErro(titulo: string, detalhe: string) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MISEO · configuração</title></head>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:10vh auto;padding:0 16px;color:#111">
<h1 style="font-size:20px">${titulo}</h1><p>${detalhe}</p>
<p style="color:#555;font-size:14px">Na Vercel: Settings → Environment Variables. Depois: Deployments → ⋯ → Redeploy.</p>
</body></html>`
  return new NextResponse(html, { status: 500, headers: { "content-type": "text/html; charset=utf-8" } })
}

// Renova a sessão do Supabase a cada requisição e manda para /login quem não entrou
export async function middleware(request: NextRequest) {
  const faltando = [
    !URL_SUPABASE && "NEXT_PUBLIC_SUPABASE_URL",
    !CHAVE_SUPABASE && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ].filter(Boolean)
  if (faltando.length) {
    return paginaErro("O app ainda não está configurado", `Falta definir: <b>${faltando.join("</b> e <b>")}</b>.`)
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(URL_SUPABASE!)) {
    return paginaErro(
      "Endereço do Supabase inválido",
      "NEXT_PUBLIC_SUPABASE_URL deve ter o formato <b>https://xxxx.supabase.co</b>, sem espaços e sem nada depois de .co.",
    )
  }

  let response = NextResponse.next({ request })
  try {
    const supabase = createServerClient(URL_SUPABASE!, CHAVE_SUPABASE!, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    })

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const publica = request.nextUrl.pathname.startsWith("/login")
    if (!user && !publica) {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      url.search = ""
      return NextResponse.redirect(url)
    }
    if (user && publica) {
      const url = request.nextUrl.clone()
      url.pathname = "/"
      url.search = ""
      return NextResponse.redirect(url)
    }
    return response
  } catch (e) {
    console.error("middleware:", e)
    return paginaErro("Não foi possível falar com o Supabase", `Detalhe técnico: ${String(e instanceof Error ? e.message : e).replace(/</g, "&lt;")}`)
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}

import Link from "next/link"
import { createClient } from "@/lib/supabase/server"

// A ficha mostra só a versão aprovada; avisa quando há rascunho com alterações esperando aprovação
export async function AvisoRascunho({ receitaId, href }: { receitaId: string; href: string }) {
  const supabase = await createClient()
  const { data } = await supabase.from("versoes_receita").select("numero, criado_em")
    .eq("receita_id", receitaId).eq("status", "rascunho").order("numero", { ascending: false }).limit(1).maybeSingle()
  if (!data) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
      <span>
        <strong>Rascunho da versão {data.numero} ainda não aprovado.</strong> Esta tela mostra a versão aprovada;
        as alterações do rascunho só passam a valer depois de aprovar.
      </span>
      <Link href={href} className="shrink-0 font-medium underline">Revisar e aprovar</Link>
    </div>
  )
}

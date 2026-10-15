import { createClient } from "@/lib/supabase/server"
import { exigirCustos } from "@/lib/sessao"
import { dataHora, numero, rotuloUnidade } from "@/lib/formato"
import { Badge } from "@/components/ui/badge"

type Versao = {
  id: string; numero: number; status: "rascunho" | "aprovada" | "arquivada"
  rendimento_quantidade: number; rendimento_unidade: string
  vigente_desde: string | null; aprovado_em: string | null; motivo_alteracao: string | null; criado_em: string
  componentes_receita: { ordem: number; etapa: string | null; quantidade: number; unidade: string; insumos: { nome: string } | null; receitas: { nome: string } | null }[]
}

const STATUS = { aprovada: "Vigente", arquivada: "Arquivada", rascunho: "Rascunho" } as const

export default async function Versoes({ params }: { params: Promise<{ id: string }> }) {
  await exigirCustos()
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from("versoes_receita")
    .select("id, numero, status, rendimento_quantidade, rendimento_unidade, vigente_desde, aprovado_em, motivo_alteracao, criado_em, componentes_receita(ordem, etapa, quantidade, unidade, insumos(nome), receitas(nome))")
    .eq("receita_id", id)
    .order("numero", { ascending: false })
  const versoes = (data ?? []) as unknown as Versao[]
  if (!versoes.length) return <p className="text-sm text-muted-foreground">Nenhuma versão.</p>

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">Versões aprovadas e arquivadas não se editam: para mudar, crie um rascunho e aprove.</p>
      {versoes.map((v) => (
        <details key={v.id} className="rounded-xl border" open={v.status === "aprovada"}>
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-sm">
            <span className="font-semibold">Versão {v.numero}</span>
            <Badge variant={v.status === "aprovada" ? "default" : "outline"}>{STATUS[v.status]}</Badge>
            <span className="text-muted-foreground">
              Rende {numero(v.rendimento_quantidade)} {rotuloUnidade(v.rendimento_unidade)}
              {v.vigente_desde ? ` · vigente desde ${dataHora(v.vigente_desde)}` : ` · criada em ${dataHora(v.criado_em)}`}
            </span>
          </summary>
          <div className="border-t px-4 py-3 text-sm">
            {v.motivo_alteracao ? <p className="mb-2 text-muted-foreground">Motivo: {v.motivo_alteracao}</p> : null}
            <ul className="divide-y">
              {[...v.componentes_receita].sort((a, b) => a.ordem - b.ordem).map((c, i) => (
                <li key={i} className="flex justify-between gap-2 py-1.5">
                  <span>{c.insumos?.nome ?? c.receitas?.nome}{c.etapa ? <span className="text-xs text-muted-foreground"> · {c.etapa}</span> : null}</span>
                  <span className="tabular-nums">{numero(c.quantidade)} {rotuloUnidade(c.unidade)}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ))}
    </div>
  )
}

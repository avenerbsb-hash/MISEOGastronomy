"use client"

import { useId, useMemo, useRef, useState } from "react"
import { classeCampo } from "@/components/campos"
import { insumosParecidos, normalizar } from "@/lib/sugestoes-nota"
import { cn } from "@/lib/utils"

type Opcao = { id: string; nome: string }

// Caixa de busca de insumo: digita para filtrar; se não achar, nada fica marcado
// e aparece o atalho para cadastrar. Mostra sugestões parecidas com o item da nota.
export function BuscaInsumo<T extends Opcao>({
  insumos, valor, aoEscolher, aoCadastrar, referencia, placeholder = "Digite para procurar o insumo…",
}: {
  insumos: T[]
  valor: string
  aoEscolher: (id: string) => void
  aoCadastrar?: (texto: string) => void
  referencia?: string            // descrição do item da nota, para sugerir parecidos
  placeholder?: string
}) {
  const [texto, setTexto] = useState("")
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const lista = useId()
  const fechar = useRef<ReturnType<typeof setTimeout> | null>(null)
  const escolhido = insumos.find((i) => i.id === valor)

  const sugestoes = useMemo(() => (referencia ? insumosParecidos(referencia, insumos, 5) : []), [referencia, insumos])
  const resultados = useMemo(() => {
    const termos = normalizar(texto).split(/\s+/).filter(Boolean)
    if (!termos.length) return sugestoes
    return insumos.filter((i) => {
      const n = normalizar(i.nome)
      return termos.every((t) => n.includes(t))
    }).slice(0, 50)
  }, [texto, insumos, sugestoes])

  const escolher = (id: string) => {
    aoEscolher(id)
    setTexto("")
    setAberto(false)
  }

  if (escolhido) {
    return (
      <div className={cn(classeCampo, "flex items-center justify-between gap-2")}>
        <span className="truncate font-medium">{escolhido.nome}</span>
        <button type="button" className="shrink-0 text-sm text-muted-foreground underline" onClick={() => aoEscolher("")}>
          trocar
        </button>
      </div>
    )
  }

  const temCadastrar = !!aoCadastrar
  const total = resultados.length + (temCadastrar ? 1 : 0)
  return (
    <div className="relative">
      <input
        role="combobox" aria-expanded={aberto} aria-controls={lista} aria-autocomplete="list"
        className={classeCampo} placeholder={placeholder} value={texto}
        onChange={(e) => { setTexto(e.target.value); setAberto(true); setAtivo(0) }}
        onFocus={() => setAberto(true)}
        onBlur={() => { fechar.current = setTimeout(() => setAberto(false), 150) }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setAberto(true); setAtivo((a) => Math.min(a + 1, total - 1)) }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)) }
          else if (e.key === "Escape") setAberto(false)
          else if (e.key === "Enter" && aberto) {
            e.preventDefault()
            if (ativo < resultados.length) escolher(resultados[ativo].id)
            else if (temCadastrar) { aoCadastrar!(texto); setAberto(false) }
          }
        }}
      />
      {aberto ? (
        <ul
          id={lista} role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-md"
          onMouseDown={() => { if (fechar.current) clearTimeout(fechar.current) }}
        >
          {!texto && sugestoes.length ? <li className="px-2 py-1 text-xs text-muted-foreground">Parecidos com o item da nota</li> : null}
          {!texto && !sugestoes.length ? <li className="px-2 py-1.5 text-muted-foreground">Digite parte do nome (ex.: whisky, jack)</li> : null}
          {texto && !resultados.length ? <li className="px-2 py-1.5 text-muted-foreground">Nenhum insumo com “{texto}”.</li> : null}
          {resultados.map((i, k) => (
            <li
              key={i.id} role="option" aria-selected={k === ativo}
              className={cn("cursor-pointer rounded-md px-2 py-1.5", k === ativo && "bg-muted")}
              onMouseEnter={() => setAtivo(k)}
              onClick={() => escolher(i.id)}
            >
              {i.nome}
            </li>
          ))}
          {temCadastrar ? (
            <li
              role="option" aria-selected={ativo === resultados.length}
              className={cn("mt-1 cursor-pointer rounded-md border-t px-2 py-1.5 font-medium text-primary", ativo === resultados.length && "bg-muted")}
              onMouseEnter={() => setAtivo(resultados.length)}
              onClick={() => { aoCadastrar!(texto); setAberto(false) }}
            >
              + Não achei: cadastrar {texto ? `“${texto}”` : "novo insumo"}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}

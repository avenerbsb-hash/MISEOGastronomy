// Traduz erros do Supabase/Postgres para mensagens claras em português.
// As regras do banco (triggers e funções) já levantam mensagens em português;
// só as mensagens automáticas do Postgres/PostgREST chegam em inglês.

type ErroBanco = { code?: string; message?: string; details?: string | null; hint?: string | null }

const TABELAS: Record<string, string> = {
  historico_precos: "histórico de preços",
  precos_item_cardapio: "preços do cardápio",
  lotes_producao: "lotes de produção",
  insumos: "insumos",
  receitas: "receitas",
  versoes_receita: "versões de receita",
  componentes_receita: "componentes da receita",
  categorias: "categorias",
  fornecedores: "fornecedores",
}

function tabela(msg: string): string {
  const m = msg.match(/(?:table|relation) "([^"]+)"/)
  return m ? TABELAS[m[1]] ?? m[1] : "este registro"
}

export function traduzirErro(e: unknown): string {
  if (!e) return "Erro desconhecido."
  if (typeof e === "string") return e
  const err = e as ErroBanco
  const msg = err.message ?? String(e)

  if (/row-level security/i.test(msg)) return `Você não tem permissão para gravar em ${tabela(msg)} nesta casa.`
  if (/permission denied/i.test(msg)) return "Você não tem permissão para esta ação."
  if (/Invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos."
  if (/Email not confirmed/i.test(msg)) return "Este e-mail ainda não foi confirmado."
  if (/fetch failed|Failed to fetch|network/i.test(msg)) return "Sem conexão com o servidor. Verifique a internet e tente de novo."

  switch (err.code) {
    case "23505":
      return /codigo/.test(msg + (err.details ?? ""))
        ? "Já existe um cadastro com esse código."
        : "Já existe um cadastro com esse nome."
    case "23503":
      return /is still referenced/i.test(err.details ?? msg)
        ? "Não é possível apagar: este registro está em uso."
        : "Um registro relacionado não foi encontrado."
    case "23502":
      return "Preencha todos os campos obrigatórios."
    case "22P02":
    case "22003":
      return "Algum valor está em formato inválido."
    case "42501":
      return /[áéíóúãõç]/i.test(msg) ? msg : "Você não tem permissão para esta ação."
    case "PGRST116":
      return "Registro não encontrado."
  }

  if (/violates check constraint/i.test(msg)) return "Algum valor está fora do permitido (verifique quantidades e valores)."
  return msg
}

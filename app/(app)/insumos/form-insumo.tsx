import { FormAcao, BotaoEnviar, type Acao } from "@/components/form-acao"
import { Campo, Entrada, Selecao } from "@/components/campos"
import { NOME_DIMENSAO, type Dimensao } from "@/lib/formato"
import type { Categoria, Insumo } from "@/lib/dados"

export function FormInsumo({
  acao, insumo, cats, nomes, admin, emUso,
}: {
  acao: Acao
  insumo?: Insumo
  cats: Categoria[]
  nomes: Map<string, string>
  admin: boolean
  emUso?: boolean
}) {
  return (
    <FormAcao acao={acao} limparAoSalvar={false} className="max-w-xl">
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Campo rotulo="Código">
          <Entrada name="codigo" defaultValue={insumo?.codigo} required maxLength={30} placeholder="BOV-017" />
        </Campo>
        <Campo rotulo="Nome">
          <Entrada name="nome" defaultValue={insumo?.nome} required maxLength={120} />
        </Campo>
      </div>
      <Campo rotulo="Categoria">
        <Selecao name="categoria_id" defaultValue={insumo?.categoria_id ?? ""}>
          <option value="">Sem categoria</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{nomes.get(c.id)}</option>
          ))}
        </Selecao>
      </Campo>
      <Campo
        rotulo="Como é medido"
        dica={emUso ? "Este insumo já tem preços ou fichas: a medida não pode mudar (crie um novo insumo)." : undefined}
      >
        <Selecao name="dimensao" defaultValue={insumo?.dimensao ?? "massa"} required>
          {(Object.keys(NOME_DIMENSAO) as Dimensao[]).map((d) => (
            <option key={d} value={d}>{NOME_DIMENSAO[d]}</option>
          ))}
        </Selecao>
      </Campo>
      <Campo rotulo="Apresentação" dica='Como costuma chegar, por exemplo "peça a vácuo" ou "caixa de 12 L".'>
        <Entrada name="apresentacao" defaultValue={insumo?.apresentacao ?? ""} maxLength={200} />
      </Campo>
      <Campo rotulo="Alergênicos" dica="Separe por vírgula: leite, glúten, crustáceos…">
        <Entrada name="alergenos" defaultValue={insumo?.alergenos?.join(", ") ?? ""} maxLength={300} />
      </Campo>
      {admin ? (
        <fieldset className="grid gap-3 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">Densidade (somente admin)</legend>
          <Campo rotulo="Densidade (g por mL)" dica="Só é usada para converter massa ↔ volume quando validada.">
            <Entrada name="densidade" inputMode="decimal" defaultValue={insumo?.densidade_g_ml ?? ""} placeholder="1,03" />
          </Campo>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="validar_densidade" defaultChecked={!!insumo?.densidade_validada_em} className="size-4" />
            Densidade validada
          </label>
        </fieldset>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="ativo" defaultChecked={insumo?.ativo ?? true} className="size-4" />
        Ativo
      </label>
      <div>
        <BotaoEnviar>Salvar</BotaoEnviar>
      </div>
    </FormAcao>
  )
}

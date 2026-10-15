"""Gera supabase/seed/01_insumos_giuli.sql a partir de notas.json + catalogo.py"""
import json, sys
from catalogo import CATALOGO, classificar, PERGUNTAS

LOTE = 'xfacil-giuli-2026-10-13'
CASAS = ['Alma Boutique Bar & Restaurante', 'Giuli Osteria', 'Recreio Bar', 'Mercearia Original', 'Malibu Sushi Bar']
ORIGEM = 'Giuli Osteria'

def q(s):  return "'" + str(s).replace("'", "''") + "'"
def n(x):  return 'null' if x is None else repr(round(x, 6))

rows = json.load(open(sys.argv[1]))
out = []
w = out.append
w(f"""-- =====================================================================
-- Seed 01 · Catálogo de proteínas e laticínios + preços das notas do Giuli
-- Fonte: relatório xFácil "Custo de proteínas pelas notas fiscais",
--        Giuli Osteria, 600 notas de 08/08 a 13/10/2026, 362 linhas, R$ 210.028,80
-- Giuli recebe o histórico completo; as demais casas recebem o último preço
-- de cada insumo como REFERÊNCIA (fonte = 'referencia') até a compra própria.
-- Rodar uma única vez, depois das migrações 0001 e 0002.
-- =====================================================================
begin;
set local timezone = 'America/Sao_Paulo';

do $$ begin
  if exists (select 1 from itens_importacao where lote_importacao = {q(LOTE)}) then
    raise exception 'Lote {LOTE} já foi importado';
  end if;
end $$;

-- Casas
insert into estabelecimentos (nome) values
  {(','+chr(10)+'  ').join('('+q(c)+')' for c in CASAS)}
on conflict (nome) do nothing;

-- Categorias
insert into categorias (nome, escopo) values ('Proteínas e laticínios', 'insumo')
on conflict do nothing;
""")
cats = sorted({v[1] for v in CATALOGO.values()})
w("insert into categorias (nome, escopo, pai_id)\nselect c, 'insumo', (select id from categorias where nome = 'Proteínas e laticínios' and escopo = 'insumo' and pai_id is null)\n  from (values " +
  ', '.join(f'({q(c)})' for c in cats) + ") v(c)\n where not exists (select 1 from categorias x where x.nome = v.c and x.escopo = 'insumo');\n")

forns = sorted({r['fornecedor'] for r in rows})
w("-- Fornecedores\ninsert into fornecedores (nome) values\n  " + ',\n  '.join(f'({q(f)})' for f in forns) + "\non conflict (nome) do nothing;\n")

w("-- Insumos canônicos\ninsert into insumos (codigo, nome, categoria_id, dimensao, apresentacao)\nselect v.codigo, v.nome, (select id from categorias where nome = v.cat and escopo = 'insumo'), v.dim::dimensao_medida, nullif(v.obs, '')\n  from (values\n  " +
  ',\n  '.join(f"({q(k)}, {q(v[0])}, {q(v[1])}, {q(v[2])}, {q(v[3])})" for k, v in sorted(CATALOGO.items())) +
  ") v(codigo, nome, cat, dim, obs)\non conflict (codigo) do nothing;\n")

# aliases (fornecedor + descrição) e linhas
alias = {}
linhas = []
for i, r in enumerate(rows):
    cod, conv = classificar(r['descricao'], r['un'])
    alias[(r['fornecedor'], r['descricao'].upper())] = (cod, conv)
    linhas.append((i, r, cod, conv))

w("-- Como cada fornecedor escreve o item (quantidade_por_un nula = conversão pendente)\ninsert into alias_insumo (fornecedor_id, descricao_original, insumo_id, quantidade_por_un, unidade)\nselect (select id from fornecedores where nome = v.f), v.d, (select id from insumos where codigo = v.c), v.qpu, v.un\n  from (values\n  " +
  ',\n  '.join(f"({q(f)}, {q(d)}, {q(c)}, {n(cv[0]) if cv else 'null::numeric'}, {q(cv[1]) if cv else 'null'})" for (f, d), (c, cv) in sorted(alias.items())) +
  ") v(f, d, c, qpu, un)\non conflict do nothing;\n")

# linhas de nota -> tabela temporária; criado_em crescente com a data para desempate determinístico
w("create temp table _notas (ordem int, data date, fornecedor text, nf text, ncm text, categoria text, descricao text, un text, qtd numeric, preco numeric, total numeric, codigo text, qpu numeric, un_base text) on commit drop;\ninsert into _notas values\n  " +
  ',\n  '.join(f"({len(rows)-i}, {q(r['data'])}, {q(r['fornecedor'])}, {q(r['nf'])}, {q(r['ncm'])}, {q(r['categoria'])}, {q(r['descricao'])}, {q(r['un'])}, {r['qtd']}, {r['preco']}, {r['total']}, {q(c)}, {n(cv[0]) if cv else 'null'}, {q(cv[1]) if cv else 'null'})" for i, r, c, cv in linhas) + ";\n")

w(f"""
-- Todas as 362 linhas ficam registradas como itens de importação do Giuli
insert into itens_importacao (lote_importacao, estabelecimento_id, fornecedor_id, data_compra, documento_ref, ncm,
                              categoria_origem, descricao_original, unidade_nota, quantidade_nota, preco_unitario_nota,
                              valor_total, insumo_id, status, motivo_pendencia, criado_em)
select {q(LOTE)}, (select id from estabelecimentos where nome = {q(ORIGEM)}), (select id from fornecedores where nome = n.fornecedor),
       n.data, 'NF ' || n.nf, n.ncm, n.categoria, n.descricao, n.un, n.qtd, n.preco, n.total,
       (select id from insumos where codigo = n.codigo),
       'pendente', case when n.qpu is null then 'Embalagem sem peso/quantidade na nota' end,
       n.data + make_interval(hours => 12, secs => n.ordem)
  from _notas n;

-- Linhas com conversão conhecida viram preço validado no Giuli
with ins as (
  insert into historico_precos (insumo_id, estabelecimento_id, fornecedor_id, data_compra, quantidade, unidade,
                                valor_total, fonte, documento_ref, status, observacao, criado_em, validado_em)
  select (select id from insumos where codigo = n.codigo), (select id from estabelecimentos where nome = {q(ORIGEM)}),
         (select id from fornecedores where nome = n.fornecedor), n.data, n.qtd * n.qpu, n.un_base, n.total,
         'relatorio_nfe', 'NF ' || n.nf, 'validado',
         {q(LOTE)} || ': ' || n.descricao || ' — ' || n.qtd || ' ' || n.un || ' × R$ ' || n.preco,
         n.data + make_interval(hours => 12, secs => n.ordem), n.data + make_interval(hours => 12, secs => n.ordem)
    from _notas n where n.qpu is not null
  returning id, criado_em, estabelecimento_id
)
update itens_importacao it set status = 'importado', historico_preco_id = ins.id
  from ins
 where it.lote_importacao = {q(LOTE)} and it.criado_em = ins.criado_em and it.estabelecimento_id = ins.estabelecimento_id;

-- Demais casas: último preço do Giuli como referência
insert into historico_precos (insumo_id, estabelecimento_id, fornecedor_id, data_compra, quantidade, unidade,
                              valor_total, fonte, documento_ref, status, observacao, criado_em, validado_em)
select h.insumo_id, e.id, h.fornecedor_id, h.data_compra, h.quantidade, h.unidade, h.valor_total,
       'referencia', h.documento_ref, 'validado',
       'Referência copiada de {ORIGEM}; substituir pela primeira compra desta casa', h.criado_em, h.validado_em
  from estabelecimentos e
  cross join insumos i
  cross join lateral (
    select * from historico_precos x
     where x.insumo_id = i.id and x.status = 'validado'
       and x.estabelecimento_id = (select id from estabelecimentos where nome = {q(ORIGEM)})
     order by x.data_compra desc, x.validado_em desc nulls last, x.criado_em desc
     limit 1) h
 where e.nome <> {q(ORIGEM)}
   and not exists (select 1 from historico_precos y
                    where y.insumo_id = i.id and y.estabelecimento_id = e.id and y.status = 'validado');

commit;

-- Pendências: responder e rodar, por exemplo (como gestor do Giuli ou admin):
""")
for cod, pergunta in PERGUNTAS.items():
    descs = sorted({(f, d) for (f, d), (c, cv) in alias.items() if c == cod and cv is None})
    for f, d in descs:
        w(f"--   {pergunta}\n--   select confirmar_conversao((select id from fornecedores where nome = {q(f)}), {q(d)}, <quantidade>, '<g|ml|un>');")
w("-- Depois: select copiar_precos_referencia(<id Giuli>, <id da casa>); para levar os novos preços às outras casas.\n")
open(sys.argv[2], 'w').write('\n'.join(out))
print('ok', len(rows), 'linhas,', len(alias), 'aliases')

-- =====================================================================
-- Migração 0002 · Itens importados de notas + preço de referência entre casas
-- =====================================================================
-- 1) Novas fontes de preço:
--    'relatorio_nfe' = linha de nota vinda de relatório (ex.: xFácil)
--    'referencia'    = preço emprestado de outra casa até a compra própria
alter table historico_precos drop constraint if exists historico_precos_fonte_check;
alter table historico_precos add constraint historico_precos_fonte_check
  check (fonte in ('manual','planilha','nfe_xml','nfe_pdf','relatorio_nfe','referencia'));

-- 2) Itens de importação: toda linha de nota lida fica guardada, com ou sem conversão.
--    É a base da futura "conferência de itens" de NF-e.
create type status_item_importacao as enum ('pendente', 'importado', 'ignorado');

create table itens_importacao (
  id                  uuid primary key default gen_random_uuid(),
  lote_importacao     text not null,                 -- ex.: 'xfacil-giuli-2026-10-13'
  estabelecimento_id  uuid not null references estabelecimentos(id),
  fornecedor_id       uuid references fornecedores(id),
  data_compra         date not null,
  documento_ref       text,
  ncm                 text,
  categoria_origem    text,
  descricao_original  text not null,
  unidade_nota        text not null,                 -- KG, UN, CX, BD, PA, PCT...
  quantidade_nota     numeric not null,
  preco_unitario_nota numeric(12,4) not null,
  valor_total         numeric(12,2) not null,
  insumo_id           uuid references insumos(id),
  status              status_item_importacao not null default 'pendente',
  motivo_pendencia    text,
  historico_preco_id  uuid references historico_precos(id),
  criado_em           timestamptz not null default now()
);
create index itens_importacao_status on itens_importacao (estabelecimento_id, status);

create trigger auditoria after insert or update or delete on itens_importacao
  for each row execute function calc.tg_auditar();

alter table itens_importacao enable row level security;
create policy leitura on itens_importacao for select using (pode_ver_custos(estabelecimento_id));
create policy gestor_insere on itens_importacao for insert with check (pode_ver_custos(estabelecimento_id));

-- 3) Confirmar a conversão de uma descrição de nota e importar as linhas pendentes dela.
--    Ex.: select confirmar_conversao(<fornecedor>, 'OVOS BRANCO GRANDE', 30, 'un');
create or replace function public.confirmar_conversao(p_fornecedor uuid, p_descricao text,
                                                      p_qtd_por_unidade numeric, p_unidade text)
returns int language plpgsql security definer set search_path = public, calc as $$
declare
  it itens_importacao;
  v_insumo uuid;
  v_hist uuid;
  v_n int := 0;
begin
  if p_qtd_por_unidade is null or p_qtd_por_unidade <= 0 then
    raise exception 'Informe a quantidade por unidade da nota';
  end if;
  select insumo_id into v_insumo from alias_insumo
   where fornecedor_id is not distinct from p_fornecedor and lower(descricao_original) = lower(p_descricao);
  if v_insumo is null then raise exception 'Descrição sem insumo vinculado: %', p_descricao; end if;

  update alias_insumo set quantidade_por_un = p_qtd_por_unidade, unidade = p_unidade
   where fornecedor_id is not distinct from p_fornecedor and lower(descricao_original) = lower(p_descricao);

  for it in select * from itens_importacao
             where fornecedor_id is not distinct from p_fornecedor
               and lower(descricao_original) = lower(p_descricao) and status = 'pendente'
             order by data_compra, criado_em
  loop
    perform calc.exigir_custos(it.estabelecimento_id);
    insert into historico_precos (insumo_id, estabelecimento_id, fornecedor_id, data_compra, quantidade, unidade,
                                  valor_total, fonte, documento_ref, status, observacao)
    values (v_insumo, it.estabelecimento_id, it.fornecedor_id, it.data_compra,
            it.quantidade_nota * p_qtd_por_unidade, p_unidade, it.valor_total, 'relatorio_nfe',
            it.documento_ref, 'validado',
            format('%s: %s %s × R$ %s', it.lote_importacao, it.quantidade_nota, it.unidade_nota, it.preco_unitario_nota))
    returning id into v_hist;
    update itens_importacao set status = 'importado', historico_preco_id = v_hist, motivo_pendencia = null
     where id = it.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- 4) Copiar o último preço validado de uma casa como referência para outra
--    (só para insumos que a casa de destino ainda não comprou).
create or replace function public.copiar_precos_referencia(p_origem uuid, p_destino uuid)
returns int language plpgsql security definer set search_path = public, calc as $$
declare v_n int;
begin
  perform calc.exigir_custos(p_origem);
  perform calc.exigir_custos(p_destino);
  insert into historico_precos (insumo_id, estabelecimento_id, fornecedor_id, data_compra, quantidade, unidade,
                                valor_total, fonte, documento_ref, status, observacao)
  select h.insumo_id, p_destino, h.fornecedor_id, h.data_compra, h.quantidade, h.unidade, h.valor_total,
         'referencia', h.documento_ref, 'validado',
         'Referência copiada de ' || (select nome from estabelecimentos where id = p_origem)
         || '; substituir pela primeira compra desta casa'
    from insumos i
    cross join lateral (
      select * from historico_precos x
       where x.insumo_id = i.id and x.estabelecimento_id = p_origem and x.status = 'validado'
       order by x.data_compra desc, x.validado_em desc nulls last, x.criado_em desc
       limit 1) h
   where not exists (select 1 from historico_precos y
                      where y.insumo_id = i.id and y.estabelecimento_id = p_destino and y.status = 'validado');
  get diagnostics v_n = row_count;
  return v_n;
end $$;

grant select, insert on itens_importacao to authenticated;
grant execute on function public.confirmar_conversao, public.copiar_precos_referencia to authenticated;

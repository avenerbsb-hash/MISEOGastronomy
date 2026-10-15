-- =====================================================================
-- Plataforma Inteligente de Fichas Técnicas e Cardápios — Grupo JF+
-- Migração 0001 · Modelo de dados + motor de cálculo + segurança (MVP)
-- Alvo: Supabase (PostgreSQL 15+). Documento de referência: Mestre v0.1
-- =====================================================================
-- Princípios aplicados:
--  * Custos NÃO são gravados como número fixo: são calculados a partir do
--    histórico de preços validado + versão de receita vigente na data.
--    Isso garante cascata automática e consulta histórica fiel.
--  * Histórico de preços, versões aprovadas, lotes e preços publicados
--    são append-only (triggers bloqueiam edição/exclusão).
--  * Preço publicado só muda via aprovar_preco(); rendimento padrão só
--    muda aprovando nova versão de receita (aprovar_versao()).
--  * Massa ↔ volume só converte com densidade validada.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Tipos
-- ---------------------------------------------------------------------
create type papel_local       as enum ('gestor', 'producao');
create type dimensao_medida   as enum ('massa', 'volume', 'contagem');
create type tipo_receita      as enum ('subproduto', 'final');
create type status_versao     as enum ('rascunho', 'aprovada', 'arquivada');
create type status_preco      as enum ('pendente', 'validado', 'rejeitado');
create type status_cardapio   as enum ('rascunho', 'publicado', 'arquivado');

-- Schema interno: funções de cálculo não expostas pela API do Supabase
create schema if not exists calc;

-- ---------------------------------------------------------------------
-- 2. Unidades de medida
-- ---------------------------------------------------------------------
create table unidades (
  codigo           text primary key,
  nome             text not null,
  dimensao         dimensao_medida not null,
  fator_para_base  numeric not null check (fator_para_base > 0)  -- base: g, mL, un
);
insert into unidades values
  ('mg', 'miligrama',  'massa',    0.001),
  ('g',  'grama',      'massa',    1),
  ('kg', 'quilograma', 'massa',    1000),
  ('ml', 'mililitro',  'volume',   1),
  ('l',  'litro',      'volume',   1000),
  ('un', 'unidade',    'contagem', 1);

-- ---------------------------------------------------------------------
-- 3. Estabelecimentos, perfis e acessos
-- ---------------------------------------------------------------------
create table estabelecimentos (
  id                         uuid primary key default gen_random_uuid(),
  nome                       text not null unique,
  marca                      text,
  ativo                      boolean not null default true,
  cmv_alvo_padrao            numeric(5,2) check (cmv_alvo_padrao > 0 and cmv_alvo_padrao < 100),
  regra_arredondamento       text not null default 'centavos'
                             check (regra_arredondamento in ('centavos','x90','inteiro','multiplo_050')),
  tolerancia_rendimento_pct  numeric(5,2) not null default 5,
  criado_em                  timestamptz not null default now(),
  criado_por                 uuid default auth.uid()
);

create table perfis (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nome       text not null,
  admin      boolean not null default false,   -- administrador central (todas as casas)
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table acessos_estabelecimento (
  user_id            uuid not null references perfis(user_id) on delete cascade,
  estabelecimento_id uuid not null references estabelecimentos(id) on delete cascade,
  papel              papel_local not null,
  criado_em          timestamptz not null default now(),
  primary key (user_id, estabelecimento_id)
);

-- ---------------------------------------------------------------------
-- 4. Catálogo: categorias, insumos, fornecedores, aliases
-- ---------------------------------------------------------------------
create table categorias (
  id      uuid primary key default gen_random_uuid(),
  nome    text not null,
  escopo  text not null check (escopo in ('insumo','receita')),
  pai_id  uuid references categorias(id),
  unique (escopo, nome, pai_id)
);

create table insumos (
  id                      uuid primary key default gen_random_uuid(),
  codigo                  text not null unique,
  nome                    text not null unique,          -- nome canônico
  categoria_id            uuid references categorias(id),
  dimensao                dimensao_medida not null,      -- define a unidade-base (g / mL / un)
  apresentacao            text,                          -- ex.: "garrafa 750 mL", "saco 5 kg"
  densidade_g_ml          numeric check (densidade_g_ml > 0),
  densidade_validada_por  uuid,
  densidade_validada_em   timestamptz,
  alergenos               text[] not null default '{}',
  ativo                   boolean not null default true,
  criado_em               timestamptz not null default now(),
  criado_por              uuid default auth.uid()
);

create table fornecedores (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  documento  text,
  contato    text,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table alias_insumo (
  id                 uuid primary key default gen_random_uuid(),
  fornecedor_id      uuid references fornecedores(id),
  descricao_original text not null,            -- como vem na nota/planilha
  insumo_id          uuid not null references insumos(id),
  quantidade_por_un  numeric,                   -- ex.: "CX 12x1L" → 12 l por caixa (uso futuro NF-e)
  unidade            text references unidades(codigo),
  criado_em          timestamptz not null default now()
);
create unique index alias_insumo_unico
  on alias_insumo (coalesce(fornecedor_id, '00000000-0000-0000-0000-000000000000'), lower(descricao_original));

-- ---------------------------------------------------------------------
-- 5. Histórico de preços (append-only)
-- ---------------------------------------------------------------------
create table historico_precos (
  id                   uuid primary key default gen_random_uuid(),
  insumo_id            uuid not null references insumos(id),
  estabelecimento_id   uuid not null references estabelecimentos(id),
  fornecedor_id        uuid references fornecedores(id),
  data_compra          date not null,
  quantidade           numeric not null check (quantidade > 0),
  unidade              text not null references unidades(codigo),
  valor_total          numeric(12,2) not null check (valor_total >= 0),
  custo_unitario_base  numeric(18,8) not null,   -- R$ por g / mL / un (calculado por trigger)
  fonte                text not null default 'manual'
                       check (fonte in ('manual','planilha','nfe_xml','nfe_pdf')),
  documento_ref        text,                      -- nº NF, chave, etc.
  status               status_preco not null default 'pendente',
  validado_por         uuid,
  validado_em          timestamptz,
  observacao           text,
  criado_em            timestamptz not null default now(),
  criado_por           uuid default auth.uid()
);
create index historico_precos_busca
  on historico_precos (insumo_id, estabelecimento_id, status, data_compra desc);

-- ---------------------------------------------------------------------
-- 6. Receitas, versões e componentes
-- ---------------------------------------------------------------------
create table receitas (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique,
  nome            text not null,
  tipo            tipo_receita not null,
  categoria_id    uuid references categorias(id),
  dimensao_saida  dimensao_medida not null,      -- final: sempre 'contagem' (porções)
  densidade_g_ml  numeric check (densidade_g_ml > 0),
  densidade_validada_em timestamptz,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  criado_por      uuid default auth.uid(),
  unique (tipo, nome),
  check (tipo = 'subproduto' or dimensao_saida = 'contagem')
);

create table versoes_receita (
  id                     uuid primary key default gen_random_uuid(),
  receita_id             uuid not null references receitas(id),
  numero                 int not null,
  status                 status_versao not null default 'rascunho',
  rendimento_quantidade  numeric not null check (rendimento_quantidade > 0),
  rendimento_unidade     text not null references unidades(codigo),
  porcao_descricao       text,           -- ex.: "taça coupé 180 mL", "prato 150 g"
  modo_preparo           text,
  apresentacao           text,
  foto_url               text,
  validade_horas         int,
  observacoes            text,
  motivo_alteracao       text,
  aprovado_por           uuid,
  aprovado_em            timestamptz,
  vigente_desde          timestamptz,
  criado_em              timestamptz not null default now(),
  criado_por             uuid default auth.uid(),
  unique (receita_id, numero)
);
create unique index versao_aprovada_unica on versoes_receita (receita_id) where status = 'aprovada';

create table componentes_receita (
  id             uuid primary key default gen_random_uuid(),
  versao_id      uuid not null references versoes_receita(id) on delete cascade,
  ordem          int not null default 0,
  etapa          text,                     -- limpeza, cocção, montagem, finalização...
  insumo_id      uuid references insumos(id),
  subproduto_id  uuid references receitas(id),
  quantidade     numeric not null check (quantidade > 0),
  unidade        text not null references unidades(codigo),
  observacao     text,
  check (num_nonnulls(insumo_id, subproduto_id) = 1)
);
create index componentes_por_versao on componentes_receita (versao_id);
create index componentes_por_sub    on componentes_receita (subproduto_id) where subproduto_id is not null;
create index componentes_por_insumo on componentes_receita (insumo_id)     where insumo_id is not null;

-- Custos adicionais aprovados na ficha final (embalagem, guarnição fixa, descartáveis)
create table custos_adicionais_versao (
  id         uuid primary key default gen_random_uuid(),
  versao_id  uuid not null references versoes_receita(id) on delete cascade,
  descricao  text not null,
  valor      numeric(10,4) not null check (valor >= 0)
);

-- ---------------------------------------------------------------------
-- 7. Lotes de produção (rendimento real; append-only)
-- ---------------------------------------------------------------------
create table lotes_producao (
  id                  uuid primary key default gen_random_uuid(),
  versao_id           uuid not null references versoes_receita(id),
  estabelecimento_id  uuid not null references estabelecimentos(id),
  produzido_em        timestamptz not null default now(),
  fator_escala        numeric not null default 1 check (fator_escala > 0),  -- 2 = receita dobrada
  quantidade_obtida   numeric not null check (quantidade_obtida >= 0),
  unidade             text not null references unidades(codigo),
  perdas_descricao    text,
  operador_id         uuid default auth.uid(),
  observacoes         text,
  criado_em           timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 8. Cardápios, itens e preços publicados (append-only)
-- ---------------------------------------------------------------------
create table cardapios (
  id                  uuid primary key default gen_random_uuid(),
  estabelecimento_id  uuid not null references estabelecimentos(id),
  nome                text not null,
  status              status_cardapio not null default 'rascunho',
  vigencia_inicio     date,
  vigencia_fim        date,
  criado_em           timestamptz not null default now(),
  criado_por          uuid default auth.uid(),
  unique (estabelecimento_id, nome),
  check (vigencia_fim is null or vigencia_inicio is null or vigencia_fim >= vigencia_inicio)
);

create table itens_cardapio (
  id             uuid primary key default gen_random_uuid(),
  cardapio_id    uuid not null references cardapios(id),
  receita_id     uuid not null references receitas(id),
  nome_exibicao  text,
  secao          text,
  ordem          int not null default 0,
  cmv_alvo       numeric(5,2) check (cmv_alvo > 0 and cmv_alvo < 100), -- null = padrão da casa
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  unique (cardapio_id, receita_id)
);

create table precos_item_cardapio (
  id                     uuid primary key default gen_random_uuid(),
  item_id                uuid not null references itens_cardapio(id),
  preco                  numeric(10,2) not null check (preco > 0),
  vigente_desde          timestamptz not null default now(),
  custo_no_momento       numeric(12,4),
  cmv_no_momento         numeric(7,2),
  sugerido_no_momento    numeric(10,2),
  aprovado_por           uuid default auth.uid(),
  motivo                 text,
  criado_em              timestamptz not null default now()
);
create index precos_item_vigencia on precos_item_cardapio (item_id, vigente_desde desc);

-- ---------------------------------------------------------------------
-- 9. Auditoria
-- ---------------------------------------------------------------------
create table eventos_auditoria (
  id           bigserial primary key,
  tabela       text not null,
  registro_id  text,
  operacao     text not null,
  antes        jsonb,
  depois       jsonb,
  usuario_id   uuid,
  motivo       text,
  ocorrido_em  timestamptz not null default now()
);
create index eventos_auditoria_registro on eventos_auditoria (tabela, registro_id, ocorrido_em desc);

create or replace function calc.tg_auditar() returns trigger
language plpgsql security definer set search_path = public, calc as $$
declare
  v_antes  jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_depois jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
begin
  insert into eventos_auditoria (tabela, registro_id, operacao, antes, depois, usuario_id, motivo)
  values (tg_table_name,
          coalesce(v_depois->>'id', v_antes->>'id', v_depois->>'user_id', v_antes->>'user_id'),
          tg_op, v_antes, v_depois, auth.uid(),
          nullif(current_setting('app.motivo', true), ''));
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['estabelecimentos','perfis','acessos_estabelecimento','insumos',
    'fornecedores','alias_insumo','historico_precos','receitas','versoes_receita',
    'componentes_receita','custos_adicionais_versao','lotes_producao','cardapios',
    'itens_cardapio','precos_item_cardapio']
  loop
    execute format('create trigger auditoria after insert or update or delete on %I
                    for each row execute function calc.tg_auditar()', t);
  end loop;
end $$;

-- =====================================================================
-- 10. Motor de cálculo (schema calc)
-- =====================================================================

create or replace function calc.unidade_base(d dimensao_medida) returns text
language sql immutable as $$
  select case d when 'massa' then 'g' when 'volume' then 'ml' else 'un' end
$$;

-- Converte quantidade para a unidade-base da dimensão-alvo.
-- Massa ↔ volume somente com densidade (g/mL) informada.
create or replace function calc.converter(p_qtd numeric, p_unidade text,
                                          p_dim_alvo dimensao_medida, p_densidade numeric default null)
returns numeric language plpgsql stable as $$
declare u unidades;
begin
  select * into u from unidades where codigo = p_unidade;
  if not found then raise exception 'Unidade desconhecida: %', p_unidade; end if;
  if u.dimensao = p_dim_alvo then
    return p_qtd * u.fator_para_base;
  end if;
  if p_densidade is null then
    raise exception 'Conversão de % para % exige densidade validada', u.dimensao, p_dim_alvo
      using errcode = 'check_violation';
  end if;
  if u.dimensao = 'volume' and p_dim_alvo = 'massa' then
    return p_qtd * u.fator_para_base * p_densidade;
  elsif u.dimensao = 'massa' and p_dim_alvo = 'volume' then
    return p_qtd * u.fator_para_base / p_densidade;
  end if;
  raise exception 'Conversão de % para % não suportada', u.dimensao, p_dim_alvo
    using errcode = 'check_violation';
end $$;

-- Densidade só vale se validada
create or replace function calc.densidade_insumo(p_insumo uuid) returns numeric
language sql stable as $$
  select case when densidade_validada_em is not null then densidade_g_ml end from insumos where id = p_insumo
$$;
create or replace function calc.densidade_receita(p_receita uuid) returns numeric
language sql stable as $$
  select case when densidade_validada_em is not null then densidade_g_ml end from receitas where id = p_receita
$$;

-- Custo de referência do insumo: último preço VALIDADO da casa até a data
create or replace function calc.custo_insumo(p_insumo uuid, p_estab uuid, p_data timestamptz default now())
returns numeric language sql stable as $$
  select custo_unitario_base
  from historico_precos
  where insumo_id = p_insumo and estabelecimento_id = p_estab
    and status = 'validado' and data_compra <= p_data::date
  order by data_compra desc, validado_em desc nulls last, criado_em desc
  limit 1
$$;

-- Preço anterior (para comparação verde/vermelho)
create or replace function calc.custo_insumo_anterior(p_insumo uuid, p_estab uuid, p_data timestamptz default now())
returns numeric language sql stable as $$
  select custo_unitario_base
  from historico_precos
  where insumo_id = p_insumo and estabelecimento_id = p_estab
    and status = 'validado' and data_compra <= p_data::date
  order by data_compra desc, validado_em desc nulls last, criado_em desc
  offset 1 limit 1
$$;

-- Versão aprovada vigente na data (inclui arquivadas para consulta histórica)
create or replace function calc.versao_vigente(p_receita uuid, p_data timestamptz default now())
returns uuid language sql stable as $$
  select id from versoes_receita
  where receita_id = p_receita and status in ('aprovada','arquivada') and vigente_desde <= p_data
  order by vigente_desde desc
  limit 1
$$;

-- Quantidade de um componente na unidade-base do que ele consome
create or replace function calc.qtd_base_componente(c componentes_receita) returns numeric
language plpgsql stable as $$
begin
  if c.insumo_id is not null then
    return calc.converter(c.quantidade, c.unidade,
             (select dimensao from insumos where id = c.insumo_id), calc.densidade_insumo(c.insumo_id));
  end if;
  return calc.converter(c.quantidade, c.unidade,
           (select dimensao_saida from receitas where id = c.subproduto_id), calc.densidade_receita(c.subproduto_id));
end $$;

-- Custo total de uma versão (rascunho ou aprovada). NULL se faltar preço.
create or replace function calc.custo_total_versao(p_versao uuid, p_estab uuid, p_data timestamptz default now())
returns numeric language plpgsql stable as $$
declare
  c componentes_receita;
  v_total numeric := 0;
  v_unit  numeric;
begin
  for c in select * from componentes_receita where versao_id = p_versao loop
    v_unit := case when c.insumo_id is not null
                   then calc.custo_insumo(c.insumo_id, p_estab, p_data)
                   else calc.custo_unitario_receita(c.subproduto_id, p_estab, p_data) end;
    if v_unit is null then return null; end if;
    v_total := v_total + calc.qtd_base_componente(c) * v_unit;
  end loop;
  v_total := v_total + coalesce((select sum(valor) from custos_adicionais_versao where versao_id = p_versao), 0);
  return v_total;
end $$;

-- Custo por unidade-base de saída (subproduto: R$/g ou R$/mL; final: R$/porção)
create or replace function calc.custo_unitario_versao(p_versao uuid, p_estab uuid, p_data timestamptz default now())
returns numeric language plpgsql stable as $$
declare v versoes_receita; r receitas; v_total numeric;
begin
  select * into v from versoes_receita where id = p_versao;
  select * into r from receitas where id = v.receita_id;
  v_total := calc.custo_total_versao(p_versao, p_estab, p_data);
  if v_total is null then return null; end if;
  return v_total / calc.converter(v.rendimento_quantidade, v.rendimento_unidade, r.dimensao_saida, null);
end $$;

create or replace function calc.custo_unitario_receita(p_receita uuid, p_estab uuid, p_data timestamptz default now())
returns numeric language plpgsql stable as $$
declare v_versao uuid := calc.versao_vigente(p_receita, p_data);
begin
  if v_versao is null then return null; end if;
  return calc.custo_unitario_versao(v_versao, p_estab, p_data);
end $$;

-- Arredondamento comercial
create or replace function calc.arredondar_preco(p_valor numeric, p_regra text) returns numeric
language sql immutable as $$
  select case p_regra
    when 'x90'          then case when p_valor <= floor(p_valor) + 0.90 then floor(p_valor) + 0.90
                                  else floor(p_valor) + 1.90 end
    when 'inteiro'      then ceil(p_valor)
    when 'multiplo_050' then ceil(p_valor * 2) / 2
    else round(p_valor, 2)
  end
$$;

-- Receitas (finais e subprodutos) que dependem, direta ou indiretamente, de um insumo
create or replace function calc.receitas_dependentes_de_insumo(p_insumo uuid)
returns table (receita_id uuid) language sql stable as $$
  with recursive dep(rid) as (
    select v.receita_id
      from componentes_receita c join versoes_receita v on v.id = c.versao_id
     where c.insumo_id = p_insumo and v.status = 'aprovada'
    union
    select v.receita_id
      from componentes_receita c join versoes_receita v on v.id = c.versao_id
      join dep on c.subproduto_id = dep.rid
     where v.status = 'aprovada'
  )
  select rid from dep
$$;

-- =====================================================================
-- 11. Regras de integridade (triggers)
-- =====================================================================

-- Histórico de preços: calcula custo base; imutável após gravado
create or replace function calc.tg_historico_precos() returns trigger
language plpgsql security definer set search_path = public, calc as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Histórico de preços não pode ser apagado (use status rejeitado)';
  end if;
  if tg_op = 'INSERT' then
    new.custo_unitario_base := new.valor_total /
      calc.converter(new.quantidade, new.unidade,
                     (select dimensao from insumos where id = new.insumo_id),
                     calc.densidade_insumo(new.insumo_id));
    if new.status = 'validado' then
      new.validado_por := coalesce(new.validado_por, auth.uid());
      new.validado_em  := coalesce(new.validado_em, now());
    end if;
    return new;
  end if;
  -- UPDATE: só a transição pendente → validado/rejeitado
  if old.status <> 'pendente' or new.status = 'pendente'
     or (to_jsonb(new) - array['status','validado_por','validado_em','observacao'])
        <> (to_jsonb(old) - array['status','validado_por','validado_em','observacao']) then
    raise exception 'Registro de preço é imutável; apenas validação/rejeição de pendentes é permitida';
  end if;
  new.validado_por := coalesce(new.validado_por, auth.uid());
  new.validado_em  := coalesce(new.validado_em, now());
  return new;
end $$;
create trigger regras before insert or update or delete on historico_precos
  for each row execute function calc.tg_historico_precos();

-- Versões: unidade de rendimento compatível; aprovadas/arquivadas imutáveis
create or replace function calc.tg_versoes_receita() returns trigger
language plpgsql security definer set search_path = public, calc as $$
declare v_dim dimensao_medida;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'rascunho' then
      raise exception 'Versão % não é rascunho e não pode ser apagada', old.numero;
    end if;
    return old;
  end if;
  select dimensao_saida into v_dim from receitas where id = new.receita_id;
  if (select dimensao from unidades where codigo = new.rendimento_unidade) <> v_dim then
    raise exception 'Rendimento deve estar em unidade de %', v_dim;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'rascunho' then
    if not (old.status = 'aprovada' and new.status = 'arquivada'
            and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status')) then
      raise exception 'Versão aprovada é imutável: crie uma nova versão';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.status = 'rascunho' and new.status <> 'rascunho'
     and coalesce(current_setting('app.aprovando', true), '') <> 'sim' then
    raise exception 'Use aprovar_versao() para aprovar';
  end if;
  if tg_op = 'INSERT' and new.status <> 'rascunho' then
    raise exception 'Nova versão nasce como rascunho';
  end if;
  return new;
end $$;
create trigger regras before insert or update or delete on versoes_receita
  for each row execute function calc.tg_versoes_receita();

-- Componentes: só em rascunho; tipo e unidade válidos; sem ciclos
create or replace function calc.tg_componentes_receita() returns trigger
language plpgsql security definer set search_path = public, calc as $$
declare
  v_receita uuid;
  v_status  status_versao;
  v_ciclo   boolean;
begin
  select receita_id, status into v_receita, v_status
    from versoes_receita where id = coalesce(new.versao_id, old.versao_id);
  if v_status <> 'rascunho' then
    raise exception 'Componentes de versão aprovada não podem ser alterados';
  end if;
  if tg_op = 'DELETE' then return old; end if;

  if new.subproduto_id is not null then
    if (select tipo from receitas where id = new.subproduto_id) <> 'subproduto' then
      raise exception 'Somente subprodutos podem compor outra receita';
    end if;
    with recursive dep(rid) as (
      select new.subproduto_id
      union
      select c.subproduto_id
        from componentes_receita c
        join versoes_receita v on v.id = c.versao_id
        join dep on v.receita_id = dep.rid
       where c.subproduto_id is not null
    )
    select exists (select 1 from dep where rid = v_receita) into v_ciclo;
    if v_ciclo then
      raise exception 'Dependência circular: esta receita já é usada por %',
        (select nome from receitas where id = new.subproduto_id);
    end if;
  end if;

  perform calc.qtd_base_componente(new);   -- valida unidade/densidade
  return new;
end $$;
create trigger regras before insert or update or delete on componentes_receita
  for each row execute function calc.tg_componentes_receita();

create or replace function calc.tg_custos_adicionais() returns trigger
language plpgsql security definer set search_path = public, calc as $$
begin
  if (select status from versoes_receita where id = coalesce(new.versao_id, old.versao_id)) <> 'rascunho' then
    raise exception 'Custos de versão aprovada não podem ser alterados';
  end if;
  return coalesce(new, old);
end $$;
create trigger regras before insert or update or delete on custos_adicionais_versao
  for each row execute function calc.tg_custos_adicionais();

-- Item de cardápio só aceita produto final
create or replace function calc.tg_itens_cardapio() returns trigger
language plpgsql security definer set search_path = public, calc as $$
begin
  if (select tipo from receitas where id = new.receita_id) <> 'final' then
    raise exception 'Cardápio aceita apenas produtos finais';
  end if;
  return new;
end $$;
create trigger regras before insert or update on itens_cardapio
  for each row execute function calc.tg_itens_cardapio();

-- Tabelas append-only
create or replace function calc.tg_somente_insercao() returns trigger
language plpgsql security definer set search_path = public, calc as $$
begin
  raise exception 'Tabela % é somente-inserção (histórico preservado)', tg_table_name;
end $$;
create trigger somente_insercao before update or delete on precos_item_cardapio
  for each row execute function calc.tg_somente_insercao();
create trigger somente_insercao before update or delete on lotes_producao
  for each row execute function calc.tg_somente_insercao();
create trigger somente_insercao before update or delete on eventos_auditoria
  for each row execute function calc.tg_somente_insercao();

-- =====================================================================
-- 12. Permissões (helpers)
-- =====================================================================
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select admin and ativo from perfis where user_id = auth.uid()), false)
$$;

create or replace function public.papel_em(p_estab uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when eh_admin() then 'admin'
              else (select a.papel::text from acessos_estabelecimento a
                      join perfis p on p.user_id = a.user_id and p.ativo
                     where a.user_id = auth.uid() and a.estabelecimento_id = p_estab) end
$$;

create or replace function public.pode_ver_custos(p_estab uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(papel_em(p_estab) in ('admin','gestor'), false)
$$;

create or replace function public.tem_acesso(p_estab uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select papel_em(p_estab) is not null
$$;

create or replace function public.eh_gestor_de_alguma() returns boolean
language sql stable security definer set search_path = public as $$
  select eh_admin() or exists (select 1 from acessos_estabelecimento a join perfis p on p.user_id = a.user_id and p.ativo
                                where a.user_id = auth.uid() and a.papel = 'gestor')
$$;

create or replace function public.usuario_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where user_id = auth.uid() and ativo)
$$;

create or replace function calc.exigir_custos(p_estab uuid) returns void
language plpgsql stable as $$
begin
  if not public.pode_ver_custos(p_estab) then
    raise exception 'Sem permissão para ver custos desta casa' using errcode = 'insufficient_privilege';
  end if;
end $$;

-- =====================================================================
-- 13. API pública (RPC) — tudo que envolve custo passa por aqui
-- =====================================================================

-- Custo unitário de uma receita na casa e data (subproduto: R$/g|mL; final: R$/porção)
create or replace function public.custo_receita(p_receita uuid, p_estab uuid, p_data timestamptz default now())
returns numeric language plpgsql stable security definer set search_path = public, calc as $$
begin
  perform calc.exigir_custos(p_estab);
  return calc.custo_unitario_receita(p_receita, p_estab, p_data);
end $$;

-- Ficha gerencial: componentes com custo (versão vigente na data ou versão específica)
create or replace function public.ficha_gerencial(p_receita uuid, p_estab uuid,
                                                  p_data timestamptz default now(), p_versao uuid default null)
returns table (versao_id uuid, versao_numero int, ordem int, etapa text, componente text, tipo text,
               quantidade numeric, unidade text, quantidade_base numeric, unidade_base text,
               custo_unitario_base numeric, custo numeric, participacao_pct numeric)
language plpgsql stable security definer set search_path = public, calc as $$
declare v_versao uuid := coalesce(p_versao, calc.versao_vigente(p_receita, p_data));
        v_total numeric;
begin
  perform calc.exigir_custos(p_estab);
  v_total := calc.custo_total_versao(v_versao, p_estab, p_data);
  return query
  with linhas as (
    select c.ordem, c.etapa,
           coalesce(i.nome, r.nome) as componente,
           case when c.insumo_id is not null then 'insumo' else 'subproduto' end as tipo,
           c.quantidade, c.unidade,
           calc.qtd_base_componente(c) as qtd_base,
           calc.unidade_base(coalesce(i.dimensao, r.dimensao_saida)) as un_base,
           case when c.insumo_id is not null then calc.custo_insumo(c.insumo_id, p_estab, p_data)
                else calc.custo_unitario_receita(c.subproduto_id, p_estab, p_data) end as cu
      from componentes_receita c
      left join insumos i  on i.id = c.insumo_id
      left join receitas r on r.id = c.subproduto_id
     where c.versao_id = v_versao
  )
  select v_versao, (select numero from versoes_receita where id = v_versao),
         l.ordem, l.etapa, l.componente, l.tipo, l.quantidade, l.unidade, l.qtd_base, l.un_base,
         round(l.cu, 6), round(l.qtd_base * l.cu, 4),
         case when v_total > 0 then round(100 * l.qtd_base * l.cu / v_total, 1) end
    from linhas l
   order by l.ordem;
end $$;

-- Preço publicado vigente de um item
create or replace function calc.preco_publicado(p_item uuid, p_data timestamptz default now())
returns numeric language sql stable as $$
  select preco from precos_item_cardapio
   where item_id = p_item and vigente_desde <= p_data
   order by vigente_desde desc limit 1
$$;

-- Painel de CMV por casa (RF-08 / RF-12)
create or replace function public.painel_cmv(p_estab uuid, p_data timestamptz default now())
returns table (item_id uuid, cardapio text, produto text, custo_porcao numeric,
               preco_publicado numeric, cmv_atual_pct numeric, cmv_alvo_pct numeric,
               preco_sugerido numeric, preco_sugerido_arredondado numeric,
               cmv_preco_arredondado_pct numeric, situacao text)
language plpgsql stable security definer set search_path = public, calc as $$
begin
  perform calc.exigir_custos(p_estab);
  return query
  with base as (
    select it.id, cd.nome as cardapio, coalesce(it.nome_exibicao, r.nome) as produto,
           calc.custo_unitario_receita(it.receita_id, p_estab, p_data) as custo,
           calc.preco_publicado(it.id, p_data) as preco,
           coalesce(it.cmv_alvo, e.cmv_alvo_padrao) as alvo,
           e.regra_arredondamento as regra
      from itens_cardapio it
      join cardapios cd on cd.id = it.cardapio_id
      join estabelecimentos e on e.id = cd.estabelecimento_id
      join receitas r on r.id = it.receita_id
     where cd.estabelecimento_id = p_estab and it.ativo and cd.status <> 'arquivado'
  ), calc1 as (
    select b.*, case when b.custo is not null and b.alvo is not null
                     then b.custo / (b.alvo / 100) end as sug
      from base b
  )
  select c.id, c.cardapio, c.produto, round(c.custo, 2), c.preco,
         case when c.preco > 0 then round(100 * c.custo / c.preco, 1) end,
         c.alvo, round(c.sug, 2),
         calc.arredondar_preco(c.sug, c.regra),
         case when c.sug is not null then round(100 * c.custo / calc.arredondar_preco(c.sug, c.regra), 1) end,
         case when c.custo is null then 'sem_custo'
              when c.alvo  is null then 'sem_alvo'
              when c.preco is null then 'sem_preco'
              when 100 * c.custo / c.preco > c.alvo + 0.05 then 'acima_do_alvo'
              when 100 * c.custo / c.preco < c.alvo - 5 then 'abaixo_do_alvo'
              else 'ok' end
    from calc1 c
   order by c.cardapio, c.produto;
end $$;

-- Aprovação consciente de preço (único caminho para mudar o preço publicado)
create or replace function public.aprovar_preco(p_item uuid, p_preco numeric, p_motivo text default null,
                                                p_vigente_desde timestamptz default now())
returns uuid language plpgsql security definer set search_path = public, calc as $$
declare v_estab uuid; v_receita uuid; v_alvo numeric; v_custo numeric; v_id uuid;
begin
  select cd.estabelecimento_id, it.receita_id, coalesce(it.cmv_alvo, e.cmv_alvo_padrao)
    into v_estab, v_receita, v_alvo
    from itens_cardapio it join cardapios cd on cd.id = it.cardapio_id
    join estabelecimentos e on e.id = cd.estabelecimento_id
   where it.id = p_item;
  if v_estab is null then raise exception 'Item inexistente'; end if;
  perform calc.exigir_custos(v_estab);
  v_custo := calc.custo_unitario_receita(v_receita, v_estab, p_vigente_desde);
  perform set_config('app.motivo', coalesce(p_motivo, 'aprovação de preço'), true);
  insert into precos_item_cardapio (item_id, preco, vigente_desde, custo_no_momento, cmv_no_momento,
                                    sugerido_no_momento, aprovado_por, motivo)
  values (p_item, p_preco, p_vigente_desde, v_custo,
          case when v_custo is not null then round(100 * v_custo / p_preco, 2) end,
          case when v_custo is not null and v_alvo is not null then round(v_custo / (v_alvo / 100), 2) end,
          auth.uid(), p_motivo)
  returning id into v_id;
  return v_id;
end $$;

-- Aprovar versão de receita (novo rendimento/composição passa a valer)
create or replace function public.aprovar_versao(p_versao uuid, p_motivo text default null,
                                                 p_vigente_desde timestamptz default now())
returns void language plpgsql security definer set search_path = public, calc as $$
declare v versoes_receita;
begin
  if not eh_admin() then
    raise exception 'Somente o administrador central aprova versões de receita' using errcode = 'insufficient_privilege';
  end if;
  select * into v from versoes_receita where id = p_versao for update;
  if v.status <> 'rascunho' then raise exception 'Versão já aprovada/arquivada'; end if;
  if not exists (select 1 from componentes_receita where versao_id = p_versao) then
    raise exception 'Versão sem componentes';
  end if;
  perform set_config('app.aprovando', 'sim', true);
  perform set_config('app.motivo', coalesce(p_motivo, 'aprovação de versão'), true);
  update versoes_receita set status = 'arquivada'
   where receita_id = v.receita_id and status = 'aprovada';
  update versoes_receita
     set status = 'aprovada', aprovado_por = auth.uid(), aprovado_em = now(),
         vigente_desde = p_vigente_desde, motivo_alteracao = coalesce(p_motivo, motivo_alteracao)
   where id = p_versao;
  perform set_config('app.aprovando', '', true);
end $$;

-- Nova versão a partir da vigente (copia componentes e custos adicionais)
create or replace function public.nova_versao(p_receita uuid) returns uuid
language plpgsql security definer set search_path = public, calc as $$
declare v_base versoes_receita; v_id uuid; v_num int;
begin
  if not eh_gestor_de_alguma() then
    raise exception 'Sem permissão para editar receitas' using errcode = 'insufficient_privilege';
  end if;
  select * into v_base from versoes_receita where id = calc.versao_vigente(p_receita);
  select coalesce(max(numero), 0) + 1 into v_num from versoes_receita where receita_id = p_receita;
  insert into versoes_receita (receita_id, numero, rendimento_quantidade, rendimento_unidade, porcao_descricao,
                               modo_preparo, apresentacao, foto_url, validade_horas, observacoes)
  values (p_receita, v_num, coalesce(v_base.rendimento_quantidade, 1), coalesce(v_base.rendimento_unidade, 'un'),
          v_base.porcao_descricao, v_base.modo_preparo, v_base.apresentacao, v_base.foto_url,
          v_base.validade_horas, v_base.observacoes)
  returning id into v_id;
  if v_base.id is not null then
    insert into componentes_receita (versao_id, ordem, etapa, insumo_id, subproduto_id, quantidade, unidade, observacao)
    select v_id, ordem, etapa, insumo_id, subproduto_id, quantidade, unidade, observacao
      from componentes_receita where versao_id = v_base.id;
    insert into custos_adicionais_versao (versao_id, descricao, valor)
    select v_id, descricao, valor from custos_adicionais_versao where versao_id = v_base.id;
  end if;
  return v_id;
end $$;

-- Validar/rejeitar um preço pendente
create or replace function public.validar_preco(p_registro uuid, p_aprovar boolean default true, p_obs text default null)
returns void language plpgsql security definer set search_path = public, calc as $$
declare v_estab uuid;
begin
  select estabelecimento_id into v_estab from historico_precos where id = p_registro;
  perform calc.exigir_custos(v_estab);
  update historico_precos
     set status = case when p_aprovar then 'validado'::status_preco else 'rejeitado'::status_preco end,
         validado_por = auth.uid(), validado_em = now(), observacao = coalesce(p_obs, observacao)
   where id = p_registro;
end $$;

-- Oscilações de preço de insumos (verde/vermelho/neutro)
create or replace function public.variacoes_insumos(p_estab uuid, p_data timestamptz default now())
returns table (insumo_id uuid, insumo text, unidade_base text, custo_atual numeric, custo_anterior numeric,
               variacao_pct numeric, sinal text, data_referencia date)
language plpgsql stable security definer set search_path = public, calc as $$
begin
  perform calc.exigir_custos(p_estab);
  return query
  select i.id, i.nome, calc.unidade_base(i.dimensao),
         round(a.atual, 6), round(a.anterior, 6),
         case when a.anterior > 0 then round(100 * (a.atual - a.anterior) / a.anterior, 1) end,
         case when a.anterior is null or a.atual = a.anterior then 'neutro'
              when a.atual < a.anterior then 'verde' else 'vermelho' end,
         (select max(h.data_compra) from historico_precos h
           where h.insumo_id = i.id and h.estabelecimento_id = p_estab and h.status = 'validado'
             and h.data_compra <= p_data::date)
    from insumos i
    cross join lateral (select calc.custo_insumo(i.id, p_estab, p_data) as atual,
                               calc.custo_insumo_anterior(i.id, p_estab, p_data) as anterior) a
   where a.atual is not null
   order by 6 desc nulls last;
end $$;

-- Fichas impactadas por um insumo (antes/depois da última mudança de preço)
create or replace function public.fichas_impactadas(p_insumo uuid, p_estab uuid)
returns table (receita_id uuid, receita text, tipo tipo_receita)
language plpgsql stable security definer set search_path = public, calc as $$
begin
  perform calc.exigir_custos(p_estab);
  return query
  select r.id, r.nome, r.tipo
    from calc.receitas_dependentes_de_insumo(p_insumo) d join receitas r on r.id = d.receita_id
   order by r.tipo desc, r.nome;
end $$;

-- Rendimento real x padrão por lote (RF-05)
create or replace function public.rendimento_lotes(p_estab uuid)
returns table (lote_id uuid, receita text, versao int, produzido_em timestamptz,
               esperado numeric, obtido numeric, unidade_base text, desvio_pct numeric, alerta boolean)
language plpgsql stable security definer set search_path = public, calc as $$
begin
  if not tem_acesso(p_estab) then
    raise exception 'Sem acesso a esta casa' using errcode = 'insufficient_privilege';
  end if;
  return query
  select l.id, r.nome, v.numero, l.produzido_em,
         calc.converter(v.rendimento_quantidade, v.rendimento_unidade, r.dimensao_saida) * l.fator_escala,
         calc.converter(l.quantidade_obtida, l.unidade, r.dimensao_saida),
         calc.unidade_base(r.dimensao_saida),
         round(100 * (calc.converter(l.quantidade_obtida, l.unidade, r.dimensao_saida)
               / (calc.converter(v.rendimento_quantidade, v.rendimento_unidade, r.dimensao_saida) * l.fator_escala) - 1), 1),
         abs(100 * (calc.converter(l.quantidade_obtida, l.unidade, r.dimensao_saida)
               / (calc.converter(v.rendimento_quantidade, v.rendimento_unidade, r.dimensao_saida) * l.fator_escala) - 1))
           > e.tolerancia_rendimento_pct
    from lotes_producao l
    join versoes_receita v on v.id = l.versao_id
    join receitas r on r.id = v.receita_id
    join estabelecimentos e on e.id = l.estabelecimento_id
   where l.estabelecimento_id = p_estab
   order by l.produzido_em desc;
end $$;

-- =====================================================================
-- 14. Ficha de produção (sem nenhum valor financeiro)
-- =====================================================================
create or replace view public.vw_ficha_producao with (security_invoker = true) as
select r.id as receita_id, r.codigo, r.nome as receita, r.tipo,
       v.id as versao_id, v.numero as versao, v.rendimento_quantidade, v.rendimento_unidade,
       v.porcao_descricao, v.modo_preparo, v.apresentacao, v.foto_url, v.validade_horas,
       c.ordem, c.etapa, coalesce(i.nome, s.nome) as componente,
       case when c.insumo_id is not null then 'insumo' else 'subproduto' end as tipo_componente,
       c.quantidade, c.unidade, c.observacao,
       i.alergenos
  from receitas r
  join versoes_receita v on v.receita_id = r.id and v.status = 'aprovada'
  left join componentes_receita c on c.versao_id = v.id
  left join insumos i  on i.id = c.insumo_id
  left join receitas s on s.id = c.subproduto_id
 where r.ativo;

-- =====================================================================
-- 15. Row Level Security
-- =====================================================================
alter table estabelecimentos          enable row level security;
alter table perfis                    enable row level security;
alter table acessos_estabelecimento   enable row level security;
alter table categorias                enable row level security;
alter table unidades                  enable row level security;
alter table insumos                   enable row level security;
alter table fornecedores              enable row level security;
alter table alias_insumo              enable row level security;
alter table historico_precos          enable row level security;
alter table receitas                  enable row level security;
alter table versoes_receita           enable row level security;
alter table componentes_receita       enable row level security;
alter table custos_adicionais_versao  enable row level security;
alter table lotes_producao            enable row level security;
alter table cardapios                 enable row level security;
alter table itens_cardapio            enable row level security;
alter table precos_item_cardapio      enable row level security;
alter table eventos_auditoria         enable row level security;

-- Leitura geral (sem dados financeiros) para usuários ativos
create policy leitura on unidades            for select using (usuario_ativo());
create policy leitura on categorias          for select using (usuario_ativo());
create policy leitura on insumos             for select using (usuario_ativo());
create policy leitura on receitas            for select using (usuario_ativo());
create policy leitura on versoes_receita     for select using (usuario_ativo());
create policy leitura on componentes_receita for select using (usuario_ativo());

create policy leitura on estabelecimentos for select using (tem_acesso(id));
create policy leitura on perfis           for select using (user_id = auth.uid() or eh_admin());
create policy leitura on acessos_estabelecimento for select using (user_id = auth.uid() or eh_admin());
create policy leitura on cardapios        for select using (tem_acesso(estabelecimento_id));

-- Dados financeiros: só gestor da casa ou admin
create policy leitura on historico_precos for select using (pode_ver_custos(estabelecimento_id));
create policy leitura on fornecedores     for select using (eh_gestor_de_alguma());
create policy leitura on alias_insumo     for select using (eh_gestor_de_alguma());
create policy leitura on custos_adicionais_versao for select using (eh_gestor_de_alguma());
create policy leitura on itens_cardapio   for select using (
  pode_ver_custos((select estabelecimento_id from cardapios where id = cardapio_id)));
create policy leitura on precos_item_cardapio for select using (
  pode_ver_custos((select cd.estabelecimento_id from itens_cardapio it
                     join cardapios cd on cd.id = it.cardapio_id where it.id = item_id)));
create policy leitura on lotes_producao   for select using (tem_acesso(estabelecimento_id));
create policy leitura on eventos_auditoria for select using (eh_admin());

-- Escrita
create policy admin_total on estabelecimentos        for all using (eh_admin()) with check (eh_admin());
create policy admin_total on perfis                  for all using (eh_admin()) with check (eh_admin());
create policy admin_total on acessos_estabelecimento for all using (eh_admin()) with check (eh_admin());
create policy admin_total on unidades                for all using (eh_admin()) with check (eh_admin());

create policy gestor_escreve on categorias   for all using (eh_gestor_de_alguma()) with check (eh_gestor_de_alguma());
create policy gestor_escreve on insumos      for all using (eh_gestor_de_alguma()) with check (eh_gestor_de_alguma());
create policy gestor_escreve on fornecedores for all using (eh_gestor_de_alguma()) with check (eh_gestor_de_alguma());
create policy gestor_escreve on alias_insumo for all using (eh_gestor_de_alguma()) with check (eh_gestor_de_alguma());
create policy gestor_escreve on receitas     for all using (eh_gestor_de_alguma()) with check (eh_gestor_de_alguma());
create policy gestor_escreve on versoes_receita for all using (eh_gestor_de_alguma()) with check (eh_gestor_de_alguma());
create policy gestor_escreve on componentes_receita for all using (eh_gestor_de_alguma()) with check (eh_gestor_de_alguma());
create policy gestor_escreve on custos_adicionais_versao for all using (eh_gestor_de_alguma()) with check (eh_gestor_de_alguma());

create policy gestor_insere on historico_precos for insert with check (pode_ver_custos(estabelecimento_id));
create policy gestor_escreve on cardapios for all using (pode_ver_custos(estabelecimento_id))
  with check (pode_ver_custos(estabelecimento_id));
create policy gestor_escreve on itens_cardapio for all
  using (pode_ver_custos((select estabelecimento_id from cardapios where id = cardapio_id)))
  with check (pode_ver_custos((select estabelecimento_id from cardapios where id = cardapio_id)));
-- precos_item_cardapio: sem política de escrita → somente via aprovar_preco()
create policy equipe_registra on lotes_producao for insert with check (tem_acesso(estabelecimento_id));

-- Grants (Supabase: papel "authenticated")
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on schema calc from public;
revoke all on all functions in schema calc from public;
grant execute on function public.custo_receita, public.ficha_gerencial, public.painel_cmv,
  public.aprovar_preco, public.aprovar_versao, public.nova_versao, public.validar_preco,
  public.variacoes_insumos, public.fichas_impactadas, public.rendimento_lotes,
  public.eh_admin, public.papel_em, public.pode_ver_custos, public.tem_acesso,
  public.eh_gestor_de_alguma, public.usuario_ativo to authenticated;

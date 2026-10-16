-- =====================================================================
-- 0012 — Inteligência de preços v1.0 (indicadores e conferência de compras)
--
-- Incremental: não altera históricos nem o critério de custeio (custo
-- oficial = último preço validado, calc.custo_insumo).
--
-- 1. historico_precos.quantidade_base: quantidade normalizada (g / mL / un),
--    gravada na inclusão; registros antigos preenchidos por valor ÷ custo-base.
-- 2. limites_conferencia_preco: limite de alta (%) por casa e por categoria
--    (sem configuração: 15%).
-- 3. conferencias_preco: compra com alta acima do limite entra PENDENTE e gera
--    conferência; o custo validado anterior continua valendo. Aprovação,
--    correção ou rejeição com justificativa e responsável (resolver_conferencia).
--    Nenhuma compra é rejeitada automaticamente.
-- 4. indicadores_mensais_insumo: por insumo, casa e mês — compras, quantidade,
--    custo médio ponderado, menor/maior preço, volatilidade e fornecedores.
--    Só compras reais validadas (sem pendentes, rejeitadas ou referência).
--    Recalculado por trigger a cada inclusão, validação ou rejeição.
-- 5. indicadores_insumos(casa, mês): indicadores A (última compra),
--    B (tendência mensal) e C (volatilidade) sem arredondamento.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Quantidade normalizada
-- ---------------------------------------------------------------------
alter table historico_precos add column if not exists quantidade_base numeric;
comment on column historico_precos.quantidade_base is
  'Quantidade na unidade-base do insumo (g/mL/un), gravada na inclusão';

create or replace function calc.tg_historico_precos() returns trigger
language plpgsql security definer set search_path = public, calc as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Histórico de preços não pode ser apagado (use status rejeitado)';
  end if;
  if tg_op = 'INSERT' then
    new.quantidade_base := calc.converter(new.quantidade, new.unidade,
                             (select dimensao from insumos where id = new.insumo_id),
                             calc.densidade_insumo(new.insumo_id));
    new.custo_unitario_base := new.valor_total / new.quantidade_base;
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

alter table historico_precos disable trigger user;
update historico_precos set quantidade_base = valor_total / custo_unitario_base
 where quantidade_base is null and custo_unitario_base > 0;
alter table historico_precos enable trigger user;

-- ---------------------------------------------------------------------
-- 2. Limites de conferência
-- ---------------------------------------------------------------------
create table if not exists limites_conferencia_preco (
  id                 uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id),
  categoria_id       uuid references categorias(id),        -- null = limite geral da casa
  limite_pct         numeric(6,2) not null check (limite_pct > 0),
  atualizado_por     uuid default auth.uid(),
  atualizado_em      timestamptz not null default now()
);
create unique index if not exists limites_conferencia_unico
  on limites_conferencia_preco (estabelecimento_id, coalesce(categoria_id, '00000000-0000-0000-0000-000000000000'));
alter table limites_conferencia_preco enable row level security;
drop policy if exists leitura on limites_conferencia_preco;
create policy leitura on limites_conferencia_preco for select using (pode_ver_custos(estabelecimento_id));
drop policy if exists gestor_escreve on limites_conferencia_preco;
create policy gestor_escreve on limites_conferencia_preco for all
  using (pode_ver_custos(estabelecimento_id)) with check (pode_ver_custos(estabelecimento_id));
grant select, insert, update, delete on limites_conferencia_preco to authenticated;

-- Limite do insumo na casa: categoria do insumo → categoria-mãe → geral da casa → 15%
create or replace function calc.limite_conferencia(p_insumo uuid, p_estab uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select l.limite_pct from insumos i join limites_conferencia_preco l
        on l.estabelecimento_id = p_estab and l.categoria_id = i.categoria_id where i.id = p_insumo),
    (select l.limite_pct from insumos i join categorias c on c.id = i.categoria_id
       join limites_conferencia_preco l on l.estabelecimento_id = p_estab and l.categoria_id = c.pai_id where i.id = p_insumo),
    (select l.limite_pct from limites_conferencia_preco l where l.estabelecimento_id = p_estab and l.categoria_id is null),
    15)
$$;

-- ---------------------------------------------------------------------
-- 3. Conferências de compra
-- ---------------------------------------------------------------------
create table if not exists conferencias_preco (
  id                    uuid primary key default gen_random_uuid(),
  historico_preco_id    uuid not null unique references historico_precos(id),
  insumo_id             uuid not null references insumos(id),
  estabelecimento_id    uuid not null references estabelecimentos(id),
  custo_novo            numeric not null,       -- R$ por unidade-base
  custo_referencia      numeric not null,       -- custo validado vigente na inclusão
  variacao_pct          numeric not null,
  limite_pct            numeric not null,
  status                text not null default 'aberta' check (status in ('aberta','aprovada','corrigida','rejeitada')),
  justificativa         text,
  resolvido_por         uuid,
  resolvido_em          timestamptz,
  registro_corrigido_id uuid references historico_precos(id),
  criado_em             timestamptz not null default now()
);
create index if not exists conferencias_abertas on conferencias_preco (estabelecimento_id, status);
alter table conferencias_preco enable row level security;
drop policy if exists leitura on conferencias_preco;
create policy leitura on conferencias_preco for select using (pode_ver_custos(estabelecimento_id));
grant select on conferencias_preco to authenticated;

-- Antes de gravar: compra real com alta acima do limite fica pendente (o custo anterior segue valendo)
create or replace function calc.tg_conferencia_preco() returns trigger
language plpgsql security definer set search_path = public, calc as $$
declare v_ref numeric; v_lim numeric;
begin
  if new.fonte = 'referencia' or new.valor_total <= 0 or new.status = 'rejeitado'
     or coalesce(current_setting('app.conferido', true), '') = 'sim' then
    return new;
  end if;
  v_ref := calc.custo_insumo(new.insumo_id, new.estabelecimento_id, new.data_compra::timestamptz);
  if v_ref is null or v_ref <= 0 then return new; end if;
  v_lim := calc.limite_conferencia(new.insumo_id, new.estabelecimento_id);
  if (new.custo_unitario_base / v_ref - 1) * 100 > v_lim then
    new.status := 'pendente';
    new.validado_por := null;
    new.validado_em := null;
  end if;
  return new;
end $$;

-- Depois de gravar: abre a conferência da compra pendente acima do limite
create or replace function calc.tg_conferencia_abrir() returns trigger
language plpgsql security definer set search_path = public, calc as $$
declare v_ref numeric; v_lim numeric;
begin
  if new.status <> 'pendente' or new.fonte = 'referencia' or new.valor_total <= 0 then return null; end if;
  v_ref := calc.custo_insumo(new.insumo_id, new.estabelecimento_id, new.data_compra::timestamptz);
  if v_ref is null or v_ref <= 0 then return null; end if;
  v_lim := calc.limite_conferencia(new.insumo_id, new.estabelecimento_id);
  if (new.custo_unitario_base / v_ref - 1) * 100 > v_lim then
    insert into conferencias_preco (historico_preco_id, insumo_id, estabelecimento_id, custo_novo, custo_referencia, variacao_pct, limite_pct)
    values (new.id, new.insumo_id, new.estabelecimento_id, new.custo_unitario_base, v_ref,
            (new.custo_unitario_base / v_ref - 1) * 100, v_lim)
    on conflict (historico_preco_id) do nothing;
  end if;
  return null;
end $$;

-- "regras" (custo-base) roda antes por ordem alfabética
drop trigger if exists regras_conferencia on historico_precos;
create trigger regras_conferencia before insert on historico_precos
  for each row execute function calc.tg_conferencia_preco();
drop trigger if exists conferencia_abrir on historico_precos;
create trigger conferencia_abrir after insert on historico_precos
  for each row execute function calc.tg_conferencia_abrir();

-- ---------------------------------------------------------------------
-- 4. Indicadores mensais
-- ---------------------------------------------------------------------
create table if not exists indicadores_mensais_insumo (
  insumo_id          uuid not null references insumos(id),
  estabelecimento_id uuid not null references estabelecimentos(id),
  mes                date not null,           -- primeiro dia do mês
  compras            int not null,
  quantidade_base    numeric not null,
  valor_total        numeric not null,
  custo_medio        numeric not null,        -- Σ valor ÷ Σ quantidade-base (média ponderada)
  menor_custo        numeric not null,
  maior_custo        numeric not null,
  volatilidade_pct   numeric,                 -- (maior ÷ menor − 1) × 100; null com menos de 2 compras
  fornecedores       int not null,
  atualizado_em      timestamptz not null default now(),
  primary key (insumo_id, estabelecimento_id, mes)
);
alter table indicadores_mensais_insumo enable row level security;
drop policy if exists leitura on indicadores_mensais_insumo;
create policy leitura on indicadores_mensais_insumo for select using (pode_ver_custos(estabelecimento_id));
grant select on indicadores_mensais_insumo to authenticated;

create or replace function calc.recalcular_mes_insumo(p_insumo uuid, p_estab uuid, p_mes date) returns void
language plpgsql security definer set search_path = public, calc as $$
declare v_mes date := date_trunc('month', p_mes)::date;
begin
  delete from indicadores_mensais_insumo where insumo_id = p_insumo and estabelecimento_id = p_estab and mes = v_mes;
  insert into indicadores_mensais_insumo (insumo_id, estabelecimento_id, mes, compras, quantidade_base, valor_total,
                                          custo_medio, menor_custo, maior_custo, volatilidade_pct, fornecedores)
  select p_insumo, p_estab, v_mes, count(*), sum(h.quantidade_base), sum(h.valor_total),
         sum(h.valor_total) / sum(h.quantidade_base),
         min(h.custo_unitario_base), max(h.custo_unitario_base),
         case when count(*) >= 2 and min(h.custo_unitario_base) > 0
              then (max(h.custo_unitario_base) / min(h.custo_unitario_base) - 1) * 100 end,
         count(distinct h.fornecedor_id)
    from historico_precos h
   where h.insumo_id = p_insumo and h.estabelecimento_id = p_estab
     and h.status = 'validado' and h.valor_total > 0 and h.fonte <> 'referencia'
     and h.quantidade_base > 0
     and h.data_compra >= v_mes and h.data_compra < (v_mes + interval '1 month')
  having count(*) > 0;
end $$;

create or replace function calc.tg_indicadores_mensais() returns trigger
language plpgsql security definer set search_path = public, calc as $$
begin
  perform calc.recalcular_mes_insumo(new.insumo_id, new.estabelecimento_id, new.data_compra);
  return null;
end $$;
drop trigger if exists indicadores_mensais on historico_precos;
create trigger indicadores_mensais after insert or update on historico_precos
  for each row execute function calc.tg_indicadores_mensais();

-- Carga inicial com o histórico existente
do $$
declare r record;
begin
  for r in select distinct insumo_id, estabelecimento_id, date_trunc('month', data_compra)::date as mes
             from historico_precos where status = 'validado' and fonte <> 'referencia' and valor_total > 0 loop
    perform calc.recalcular_mes_insumo(r.insumo_id, r.estabelecimento_id, r.mes);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. Leitura dos indicadores e resolução das conferências
-- ---------------------------------------------------------------------
-- Mês de referência no calendário da casa (São Paulo)
create or replace function calc.hoje_casa() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- A: duas últimas compras validadas · B: média do mês × mês anterior · C: amplitude no mês.
-- Valores sem arredondamento; status classificado pelos valores completos.
create or replace function public.indicadores_insumos(p_estab uuid, p_mes date default null)
returns table (insumo_id uuid, custo_oficial numeric, custo_oficial_referencia boolean,
               data_ultima_compra date, ultimo_preco numeric, preco_anterior numeric,
               variacao_ultima_pct numeric, status_ultima text,
               mes date, mes_encerrado boolean, media_mes numeric, media_mes_anterior numeric,
               variacao_mensal_pct numeric, status_mensal text,
               compras_mes int, volatilidade_pct numeric, status_volatilidade text)
language plpgsql stable security definer set search_path = public, calc as $$
declare v_mes date := date_trunc('month', coalesce(p_mes, calc.hoje_casa()))::date;
begin
  perform calc.exigir_custos(p_estab);
  return query
  with ult as (
    select h.insumo_id as iid, h.custo_unitario_base as custo, h.data_compra,
           row_number() over (partition by h.insumo_id order by h.data_compra desc, h.validado_em desc nulls last, h.criado_em desc) as n
      from historico_precos h
     where h.estabelecimento_id = p_estab and h.status = 'validado' and h.valor_total > 0 and h.fonte <> 'referencia'
  ), a as (
    select u.iid,
           max(u.custo) filter (where u.n = 1) as atual,
           max(u.custo) filter (where u.n = 2) as anterior,
           max(u.data_compra) filter (where u.n = 1) as data_ult
      from ult u where u.n <= 2 group by u.iid
  ), base as (
    select i.id, calc.custo_insumo(i.id, p_estab) as oficial from insumos i where i.ativo
  )
  select b.id, b.oficial,
         (b.oficial is not null and a.atual is null),
         a.data_ult, a.atual, a.anterior,
         case when a.anterior > 0 then (a.atual / a.anterior - 1) * 100 end,
         case when b.oficial is null and a.atual is null then 'sem_preco'
              when a.anterior is null then 'sem_comparacao'
              when a.atual > a.anterior then 'subiu'
              when a.atual < a.anterior then 'caiu'
              else 'estavel' end,
         v_mes, v_mes < date_trunc('month', calc.hoje_casa())::date,
         m.custo_medio, p.custo_medio,
         case when m.custo_medio > 0 and p.custo_medio > 0 then (m.custo_medio / p.custo_medio - 1) * 100 end,
         case when m.custo_medio is null or p.custo_medio is null then 'sem_base'
              when m.custo_medio > p.custo_medio then 'subiu'
              when m.custo_medio < p.custo_medio then 'caiu'
              else 'estavel' end,
         coalesce(m.compras, 0), m.volatilidade_pct,
         case when m.volatilidade_pct is null then 'indisponivel' else 'ok' end
    from base b
    left join a on a.iid = b.id
    left join indicadores_mensais_insumo m on m.insumo_id = b.id and m.estabelecimento_id = p_estab and m.mes = v_mes
    left join indicadores_mensais_insumo p on p.insumo_id = b.id and p.estabelecimento_id = p_estab
                                          and p.mes = (v_mes - interval '1 month')::date;
end $$;

-- Histórico mensal de um insumo na casa (últimos p_meses meses com compra), com a tendência
-- contra o mês calendário imediatamente anterior (sem compra nele: sem base)
create or replace function public.historico_mensal_insumo(p_insumo uuid, p_estab uuid, p_meses int default 12)
returns table (mes date, mes_encerrado boolean, compras int, quantidade_base numeric, custo_medio numeric,
               menor_custo numeric, maior_custo numeric, volatilidade_pct numeric, fornecedores int,
               variacao_mensal_pct numeric, status_mensal text)
language plpgsql stable security definer set search_path = public, calc as $$
begin
  perform calc.exigir_custos(p_estab);
  return query
  select m.mes, m.mes < date_trunc('month', calc.hoje_casa())::date, m.compras, m.quantidade_base, m.custo_medio,
         m.menor_custo, m.maior_custo, m.volatilidade_pct, m.fornecedores,
         case when p.custo_medio > 0 then (m.custo_medio / p.custo_medio - 1) * 100 end,
         case when p.custo_medio is null then 'sem_base'
              when m.custo_medio > p.custo_medio then 'subiu'
              when m.custo_medio < p.custo_medio then 'caiu'
              else 'estavel' end
    from indicadores_mensais_insumo m
    left join indicadores_mensais_insumo p on p.insumo_id = m.insumo_id and p.estabelecimento_id = m.estabelecimento_id
                                          and p.mes = (m.mes - interval '1 month')::date
   where m.insumo_id = p_insumo and m.estabelecimento_id = p_estab
     and m.mes >= (date_trunc('month', calc.hoje_casa()) - make_interval(months => greatest(p_meses, 1) - 1))::date
   order by m.mes;
end $$;

-- Conferências da casa com nomes (insumo, responsável)
create or replace function public.conferencias_da_casa(p_estab uuid, p_abertas boolean default true, p_limite int default 50)
returns table (id uuid, historico_preco_id uuid, insumo_id uuid, insumo text, dimensao text,
               data_compra date, fornecedor text, documento_ref text, quantidade numeric, unidade text, valor_total numeric,
               custo_novo numeric, custo_referencia numeric, variacao_pct numeric, limite_pct numeric,
               status text, justificativa text, responsavel text, resolvido_em timestamptz, criado_em timestamptz)
language plpgsql stable security definer set search_path = public, calc as $$
begin
  perform calc.exigir_custos(p_estab);
  return query
  select c.id, c.historico_preco_id, c.insumo_id, i.nome, i.dimensao::text,
         h.data_compra, f.nome, h.documento_ref, h.quantidade, h.unidade, h.valor_total,
         c.custo_novo, c.custo_referencia, c.variacao_pct, c.limite_pct,
         c.status, c.justificativa, pf.nome, c.resolvido_em, c.criado_em
    from conferencias_preco c
    join historico_precos h on h.id = c.historico_preco_id
    join insumos i on i.id = c.insumo_id
    left join fornecedores f on f.id = h.fornecedor_id
    left join perfis pf on pf.user_id = c.resolvido_por
   where c.estabelecimento_id = p_estab and ((c.status = 'aberta') = p_abertas)
   order by case when p_abertas then c.criado_em end asc, c.resolvido_em desc nulls last
   limit p_limite;
end $$;

-- Aprovar, corrigir (quantidade/unidade/valor) ou rejeitar, sempre com justificativa
create or replace function public.resolver_conferencia(p_conferencia uuid, p_acao text, p_justificativa text,
                                                       p_quantidade numeric default null, p_unidade text default null,
                                                       p_valor numeric default null)
returns uuid language plpgsql security definer set search_path = public, calc as $$
declare c conferencias_preco; h historico_precos; v_novo uuid;
begin
  select * into c from conferencias_preco where id = p_conferencia for update;
  if not found then raise exception 'Conferência não encontrada'; end if;
  perform calc.exigir_custos(c.estabelecimento_id);
  if c.status <> 'aberta' then raise exception 'Esta conferência já foi resolvida'; end if;
  if nullif(btrim(coalesce(p_justificativa, '')), '') is null then
    raise exception 'Informe a justificativa da conferência' using errcode = 'check_violation';
  end if;
  select * into h from historico_precos where id = c.historico_preco_id;

  if p_acao = 'aprovar' then
    update historico_precos set status = 'validado', validado_por = auth.uid(), validado_em = now(),
           observacao = concat_ws(' · ', observacao, 'Conferência aprovada: ' || p_justificativa)
     where id = h.id;
    update conferencias_preco set status = 'aprovada' where id = c.id;
  elsif p_acao = 'rejeitar' then
    update historico_precos set status = 'rejeitado', validado_por = auth.uid(), validado_em = now(),
           observacao = concat_ws(' · ', observacao, 'Conferência rejeitada: ' || p_justificativa)
     where id = h.id;
    update conferencias_preco set status = 'rejeitada' where id = c.id;
  elsif p_acao = 'corrigir' then
    if p_quantidade is null or p_quantidade <= 0 or p_unidade is null or p_valor is null or p_valor <= 0 then
      raise exception 'Informe quantidade, unidade e valor corrigidos' using errcode = 'check_violation';
    end if;
    update historico_precos set status = 'rejeitado', validado_por = auth.uid(), validado_em = now(),
           observacao = concat_ws(' · ', observacao, 'Corrigido na conferência: ' || p_justificativa)
     where id = h.id;
    perform set_config('app.conferido', 'sim', true);
    insert into historico_precos (insumo_id, estabelecimento_id, fornecedor_id, data_compra, quantidade, unidade,
                                  valor_total, fonte, documento_ref, status, observacao)
    values (h.insumo_id, h.estabelecimento_id, h.fornecedor_id, h.data_compra, p_quantidade, p_unidade,
            p_valor, h.fonte, h.documento_ref, 'validado', 'Correção da conferência: ' || p_justificativa)
    returning id into v_novo;
    perform set_config('app.conferido', '', true);
    update conferencias_preco set status = 'corrigida', registro_corrigido_id = v_novo where id = c.id;
  else
    raise exception 'Ação inválida: use aprovar, corrigir ou rejeitar';
  end if;

  update conferencias_preco set justificativa = p_justificativa, resolvido_por = auth.uid(), resolvido_em = now()
   where id = c.id;
  return coalesce(v_novo, h.id);
end $$;

-- Validação simples (lista de pendências) também fecha a conferência aberta, se houver
create or replace function public.validar_preco(p_registro uuid, p_aprovar boolean default true, p_obs text default null)
returns void language plpgsql security definer set search_path = public, calc as $$
declare v_estab uuid; v_conf uuid;
begin
  select estabelecimento_id into v_estab from historico_precos where id = p_registro;
  perform calc.exigir_custos(v_estab);
  select id into v_conf from conferencias_preco where historico_preco_id = p_registro and status = 'aberta';
  if v_conf is not null then
    perform public.resolver_conferencia(v_conf, case when p_aprovar then 'aprovar' else 'rejeitar' end,
                                        coalesce(nullif(btrim(p_obs), ''), case when p_aprovar then 'Validado na lista de pendências'
                                                                                 else 'Rejeitado na lista de pendências' end));
    return;
  end if;
  update historico_precos
     set status = case when p_aprovar then 'validado'::status_preco else 'rejeitado'::status_preco end,
         validado_por = auth.uid(), validado_em = now(), observacao = coalesce(p_obs, observacao)
   where id = p_registro;
end $$;

revoke all on function calc.limite_conferencia(uuid, uuid) from public;
revoke all on function calc.recalcular_mes_insumo(uuid, uuid, date) from public;
grant execute on function public.indicadores_insumos(uuid, date) to authenticated;
grant execute on function public.conferencias_da_casa(uuid, boolean, int) to authenticated;
grant execute on function public.historico_mensal_insumo(uuid, uuid, int) to authenticated;
grant execute on function public.resolver_conferencia(uuid, text, text, numeric, text, numeric) to authenticated;

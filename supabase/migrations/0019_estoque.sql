-- =====================================================================
-- 0019 — Estoque: itens controlados, contagem e pedido semanal
-- (no modelo das abas PEDIDOS DE COMPRA e CONTAGEM da planilha do bar)
-- • estoque_itens: por casa, os insumos controlados, a unidade de compra
--   (garrafa, unidade, kg…), quanto cada unidade tem (g/mL/un, opcional,
--   para o valor estimado) e o estoque mínimo.
-- • contagens_estoque + contagem_itens: cada contagem fica guardada
--   (depósito + bar). Não se edita nem se apaga: corrigiu, conta de novo.
--   Quem tem acesso à casa conta (a produção também, sem ver R$);
--   gestor/admin configura itens e mínimos.
-- • pedido_semanal: estoque atual = última contagem de cada item;
--   pedir = mínimo − atual (nunca negativo); valor estimado só para quem
--   vê custos. Não depende das fichas técnicas.
-- Pode rodar de novo.
-- =====================================================================

create table if not exists estoque_itens (
  id                 uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id),
  insumo_id          uuid not null references insumos(id),
  unidade_compra     text not null default 'unidade' check (length(btrim(unidade_compra)) between 1 and 30),
  conteudo           numeric check (conteudo > 0),           -- g / mL / un por unidade de compra
  estoque_minimo     numeric not null default 0 check (estoque_minimo >= 0),
  ativo              boolean not null default true,
  observacao         text,
  atualizado_por     uuid default auth.uid(),
  atualizado_em      timestamptz not null default now(),
  unique (estabelecimento_id, insumo_id)
);
alter table estoque_itens enable row level security;
drop policy if exists leitura on estoque_itens;
create policy leitura on estoque_itens for select using (tem_acesso(estabelecimento_id));
drop policy if exists gestor_escreve on estoque_itens;
create policy gestor_escreve on estoque_itens for all
  using (pode_ver_custos(estabelecimento_id)) with check (pode_ver_custos(estabelecimento_id));
grant select, insert, update on estoque_itens to authenticated;

create table if not exists contagens_estoque (
  id                 uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references estabelecimentos(id),
  data               date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  observacao         text,
  criado_por         uuid default auth.uid(),
  criado_em          timestamptz not null default now()
);
create index if not exists contagens_por_casa on contagens_estoque (estabelecimento_id, data desc, criado_em desc);
alter table contagens_estoque enable row level security;
drop policy if exists leitura on contagens_estoque;
create policy leitura on contagens_estoque for select using (tem_acesso(estabelecimento_id));
grant select on contagens_estoque to authenticated;

create table if not exists contagem_itens (
  id          uuid primary key default gen_random_uuid(),
  contagem_id uuid not null references contagens_estoque(id),
  insumo_id   uuid not null references insumos(id),
  deposito    numeric not null default 0 check (deposito >= 0),
  bar         numeric not null default 0 check (bar >= 0),
  total       numeric generated always as (deposito + bar) stored,
  unique (contagem_id, insumo_id)
);
create index if not exists contagem_itens_insumo on contagem_itens (insumo_id);
alter table contagem_itens enable row level security;
drop policy if exists leitura on contagem_itens;
create policy leitura on contagem_itens for select
  using (exists (select 1 from contagens_estoque c where c.id = contagem_id and tem_acesso(c.estabelecimento_id)));
grant select on contagem_itens to authenticated;

-- Grava uma contagem inteira (só itens controlados da casa). p_itens: [{insumo_id, deposito, bar}]
create or replace function public.registrar_contagem(p_estab uuid, p_itens jsonb, p_obs text default null, p_data date default null)
returns uuid language plpgsql security definer set search_path = public, calc as $$
declare v_id uuid; n int;
begin
  if not tem_acesso(p_estab) and auth.uid() is not null then
    raise exception 'Sem acesso a esta casa' using errcode = 'insufficient_privilege';
  end if;
  insert into contagens_estoque (estabelecimento_id, data, observacao)
  values (p_estab, coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date), nullif(btrim(coalesce(p_obs, '')), ''))
  returning id into v_id;
  insert into contagem_itens (contagem_id, insumo_id, deposito, bar)
  select v_id, (x->>'insumo_id')::uuid, coalesce((x->>'deposito')::numeric, 0), coalesce((x->>'bar')::numeric, 0)
    from jsonb_array_elements(coalesce(p_itens, '[]')) x
   where exists (select 1 from estoque_itens e where e.estabelecimento_id = p_estab and e.insumo_id = (x->>'insumo_id')::uuid);
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Informe a contagem de pelo menos um item' using errcode = 'check_violation'; end if;
  return v_id;
end $$;

-- Pedido da semana: mínimo × última contagem de cada item controlado da casa
create or replace function public.pedido_semanal(p_estab uuid)
returns table (insumo_id uuid, insumo text, grupo text, unidade_compra text, conteudo numeric, estoque_minimo numeric,
               deposito numeric, bar numeric, atual numeric, data_contagem date, pedir numeric,
               valor_estimado numeric)
language plpgsql stable security definer set search_path = public, calc as $$
declare v_custos boolean := pode_ver_custos(p_estab);
begin
  if not tem_acesso(p_estab) then
    raise exception 'Sem acesso a esta casa' using errcode = 'insufficient_privilege';
  end if;
  return query
  with ult as (
    select distinct on (ci.insumo_id) ci.insumo_id, ci.deposito, ci.bar, ci.total, c.data
      from contagem_itens ci join contagens_estoque c on c.id = ci.contagem_id
     where c.estabelecimento_id = p_estab
     order by ci.insumo_id, c.data desc, c.criado_em desc
  )
  select e.insumo_id, i.nome,
         coalesce(cp.nome || ' › ' || c.nome, c.nome, 'Sem categoria'),
         e.unidade_compra, e.conteudo, e.estoque_minimo,
         u.deposito, u.bar, u.total, u.data,
         greatest(e.estoque_minimo - coalesce(u.total, 0), 0),
         case when v_custos and e.conteudo is not null
              then greatest(e.estoque_minimo - coalesce(u.total, 0), 0) * e.conteudo * calc.custo_insumo(e.insumo_id, p_estab) end
    from estoque_itens e
    join insumos i on i.id = e.insumo_id
    left join categorias c on c.id = i.categoria_id
    left join categorias cp on cp.id = c.pai_id
    left join ult u on u.insumo_id = e.insumo_id
   where e.estabelecimento_id = p_estab and e.ativo
   order by 3, i.nome;
end $$;

grant execute on function public.registrar_contagem(uuid, jsonb, text, date) to authenticated;
grant execute on function public.pedido_semanal(uuid) to authenticated;

-- Papéis do estoque: "estoquista" (pedido da semana + contagem, sem R$) e
-- "contagem" (só a tela de contagem). As telas de cada papel ficam no app.
alter type papel_local add value if not exists 'estoquista';
alter type papel_local add value if not exists 'contagem';

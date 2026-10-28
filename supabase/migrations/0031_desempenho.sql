-- =====================================================================
-- 0031 — Desempenho: as telas de custo ficaram lentas com a base maior
-- • Os cálculos de custo de cada ficha eram refeitos várias vezes na mesma
--   consulta (uma vez para cada coluna que usava o valor). Agora cada custo é
--   calculado uma vez só (CTE "materialized"). Resultado igual, bem mais rápido.
-- • A data da última compra de cada ficha lia o histórico de preços inteiro da
--   casa; agora lê só os preços dos insumos da ficha (pelo índice).
-- • calc.insumos_da_versao passa a usar o índice de componentes.
-- • custos_receitas: custo de várias receitas numa chamada só (a lista de
--   fichas e de preparos fazia uma chamada por receita).
-- • insumos_em_fichas: insumos usados em fichas e preparos aprovados, numa
--   chamada só (antes eram várias páginas de 1000 componentes).
-- • Preços, notas importadas, conferências e médias mensais: a permissão de
--   leitura deixa de ser conferida linha por linha (mesma regra, mais rápida).
-- Nenhum dado muda. Pode rodar de novo.
-- =====================================================================

-- Insumos usados por uma versão, inclusive dentro dos subprodutos (versão vigente de hoje)
create or replace function calc.insumos_da_versao(p_versao uuid)
returns table (insumo_id uuid) language sql stable rows 20 as $$
  with recursive arvore(versao_id) as (
    select p_versao
    union
    select calc.versao_vigente(c.subproduto_id)
      from componentes_receita c join arvore a on a.versao_id = c.versao_id
     where c.subproduto_id is not null and calc.versao_vigente(c.subproduto_id) is not null
  )
  select distinct c.insumo_id
    from componentes_receita c
   where c.versao_id = any (array(select versao_id from arvore)) and c.insumo_id is not null
$$;

-- ---------------------------------------------------------------------
-- Mesmas funções de antes (0005, 0013, 0017, 0026, 0030), com cada custo calculado uma vez
-- ---------------------------------------------------------------------
create or replace function public.painel_cmv(p_estab uuid, p_data timestamp with time zone default now())
returns table (item_id uuid, cardapio text, produto text, custo_porcao numeric, preco_publicado numeric, cmv_atual_pct numeric, cmv_alvo_pct numeric, origem_referencia text, preco_sugerido numeric, preco_sugerido_arredondado numeric, cmv_preco_arredondado_pct numeric, preco_sugerido_margem numeric, preco_sugerido_margem_arredondado numeric, cmv_preco_margem_arredondado_pct numeric, margem_atual numeric, margem_referencia numeric, situacao text)
language plpgsql
stable security definer
set search_path = public, calc
as $$
begin
  perform calc.exigir_custos(p_estab);
  return query
  with base as materialized (
    select it.id, cd.nome as cardapio, coalesce(it.nome_exibicao, r.nome) as produto,
           calc.custo_unitario_receita(it.receita_id, p_estab, p_data) as custo,
           calc.preco_publicado(it.id, p_data) as preco,
           ref.cmv_ref, ref.origem, ref.preco_ref, ref.custo_ref,
           e.regra_arredondamento as regra
      from itens_cardapio it
      join cardapios cd on cd.id = it.cardapio_id
      join estabelecimentos e on e.id = cd.estabelecimento_id
      join receitas r on r.id = it.receita_id
      cross join lateral calc.referencia_item(it.id, p_data) ref
     where cd.estabelecimento_id = p_estab and it.ativo and cd.status <> 'arquivado'
  ), s as (
    select b.*,
           case when b.custo is not null and b.cmv_ref > 0 then b.custo / (b.cmv_ref / 100) end as sug_cmv,
           case when b.custo is not null and b.preco_ref is not null and b.custo_ref is not null
                then b.custo + (b.preco_ref - b.custo_ref) end as sug_margem
      from base b
  )
  select s.id, s.cardapio, s.produto, round(s.custo, 2), s.preco,
         case when s.preco > 0 then round(100 * s.custo / s.preco, 1) end,
         round(s.cmv_ref, 1), s.origem,
         round(s.sug_cmv, 2),
         calc.arredondar_preco(s.sug_cmv, s.regra),
         round(100 * s.custo / nullif(calc.arredondar_preco(s.sug_cmv, s.regra), 0), 1),
         round(s.sug_margem, 2),
         calc.arredondar_preco(s.sug_margem, s.regra),
         case when s.sug_margem > 0
              then round(100 * s.custo / nullif(calc.arredondar_preco(s.sug_margem, s.regra), 0), 1) end,
         case when s.preco is not null then round(s.preco - s.custo, 2) end,
         case when s.preco_ref is not null then round(s.preco_ref - s.custo_ref, 2) end,
         case when s.custo is null   then 'sem_custo'
              when s.cmv_ref is null then 'sem_alvo'
              when s.preco is null   then 'sem_preco'
              when 100 * s.custo / s.preco > s.cmv_ref + 0.05 then 'acima_do_alvo'
              when 100 * s.custo / s.preco < s.cmv_ref - 5    then 'abaixo_do_alvo'
              else 'ok' end
    from s
   order by s.cardapio, s.produto;
end $$;

create or replace function public.variacao_fichas(p_estab uuid, p_tipo text default null)
returns table (receita_id uuid, nome text, custo_atual numeric, custo_anterior numeric, variacao_pct numeric, sinal text, data_referencia date)
language plpgsql
stable security definer
set search_path = public, calc
as $$
begin
  perform calc.exigir_custos(p_estab);
  return query
  with base as materialized (
    select x.id, x.nome, calc.versao_vigente(x.id) as versao
      from receitas x
     where x.ativo and (p_tipo is null or x.tipo::text = p_tipo) and calc.visivel(x.estabelecimento_id, p_estab)
  ), ref as materialized (
    select b.id, b.nome, b.versao,
           -- última compra real (preço de referência da planilha não conta como compra)
           -- (insumo por insumo, pelo índice do histórico)
           (select max(u.dia) from calc.insumos_da_versao(b.versao) q
              cross join lateral (select max(h.data_compra) as dia from historico_precos h
                                   where h.insumo_id = q.insumo_id and h.estabelecimento_id = p_estab
                                     and h.status = 'validado' and h.valor_total > 0
                                     and h.fonte <> 'referencia' and h.data_compra <= current_date) u) as data_ref
      from base b
     where b.versao is not null
  ), custos as materialized (
    select r.id, r.nome, r.data_ref,
           calc.custo_unitario_versao(r.versao, p_estab) as atual,
           case when r.data_ref is not null
                then calc.custo_unitario_versao_precos_em(r.versao, p_estab, (r.data_ref - 1)::timestamptz) end as anterior
      from ref r
  )
  select c.id, c.nome, round(c.atual, 6), round(c.anterior, 6),
         case when c.anterior > 0 then round(100 * (c.atual - c.anterior) / c.anterior, 1) end,
         -- abaixo de 0,05% conta como igual (evita "▲ 0,0%" por arredondamento)
         case when c.anterior is null or abs(c.atual - c.anterior) <= 0.0005 * c.anterior then 'neutro'
              when c.atual < c.anterior then 'verde' else 'vermelho' end,
         c.data_ref
    from custos c
   where c.atual is not null;
end $$;

create or replace function public.resultado_itens_casa(p_estab uuid)
returns table (item_id uuid, receita_id uuid, preco numeric, custo numeric, variaveis_valor numeric, estrutura_valor numeric, margem_contribuicao numeric, margem_contribuicao_pct numeric, resultado numeric, resultado_pct numeric, lucro_alvo_pct numeric, preco_ideal numeric, preco_ideal_arredondado numeric, cmv_preco_ideal_pct numeric, situacao text)
language plpgsql
stable security definer
set search_path = public, calc
as $$
declare k record; v_regra text;
begin
  perform calc.exigir_custos(p_estab);
  select * into k from public.estrutura_custos(p_estab);
  select regra_arredondamento into v_regra from estabelecimentos where id = p_estab;
  return query
  with b as materialized (
    select it.id, it.receita_id as rid, calc.preco_publicado(it.id) as p, calc.custo_unitario_receita(it.receita_id, p_estab) as c
      from itens_cardapio it join cardapios cd on cd.id = it.cardapio_id
     where cd.estabelecimento_id = p_estab and it.ativo and cd.status <> 'arquivado'
  ), r as (
    select b.*, b.p * k.variaveis_pct / 100 as var, b.p * k.estrutura_pct / 100 as est,
           case when b.c is not null then b.c / (1 - k.total_pct / 100) end as ideal
      from b
  )
  select r.id, r.rid, r.p, round(r.c, 4), round(r.var, 2), round(r.est, 2),
         round(r.p - r.c - r.var, 2), case when r.p > 0 then round(100 * (r.p - r.c - r.var) / r.p, 1) end,
         round(r.p - r.c - r.var - r.est, 2), case when r.p > 0 then round(100 * (r.p - r.c - r.var - r.est) / r.p, 1) end,
         k.investimento_lucro_pct,
         round(r.ideal, 2), calc.arredondar_preco(r.ideal, v_regra),
         case when r.ideal > 0 then round(100 * r.c / calc.arredondar_preco(r.ideal, v_regra), 1) end,
         case when r.p is null or r.c is null then 'sem_dados'
              when r.p - r.c - r.var - r.est < 0 then 'prejuizo'
              when 100 * (r.p - r.c - r.var - r.est) / r.p < k.investimento_lucro_pct - 0.05 then 'abaixo_do_alvo'
              else 'ok' end
    from r;
end $$;

create or replace function public.custo_vs_media_casa(p_estab uuid, p_n integer default 10)
returns table (item_id uuid, receita_id uuid, custo_atual numeric, custo_media numeric, variacao_pct numeric, status text)
language plpgsql
stable security definer
set search_path = public, calc
as $$
begin
  perform calc.exigir_custos(p_estab);
  return query
  with it as materialized (
    select i.id, i.receita_id,
           calc.custo_unitario_receita(i.receita_id, p_estab) as atual,
           calc.custo_unitario_receita_media(i.receita_id, p_estab, p_n) as media
      from itens_cardapio i
      join cardapios cd on cd.id = i.cardapio_id and cd.status <> 'arquivado'
     where cd.estabelecimento_id = p_estab and i.ativo
  )
  select it.id, it.receita_id, it.atual, it.media,
         case when it.media > 0 then (it.atual / it.media - 1) * 100 end,
         case when it.atual is null or it.media is null or it.media <= 0 then 'sem_comparacao'
              when round((it.atual / it.media - 1) * 100, 1) = 0 then 'estavel'
              when it.atual > it.media then 'subiu'
              else 'caiu' end
    from it;
end $$;

create or replace function public.alertas_fichas_niveis(p_estab uuid, p_dias integer default 30)
returns table (receita_id uuid, item_id uuid, produto text, grupo text, custo_antes numeric, custo_hoje numeric, variacao_pct numeric, preco numeric, cmv_antes numeric, cmv_hoje numeric, variacao_cmv_pp numeric, meta_pct numeric, cruzou_meta boolean, nivel_custo integer, nivel_cmv integer, nivel integer, insumos text)
language plpgsql
stable security definer
set search_path = public, calc
as $$
#variable_conflict use_column
declare
  v_dias int := least(greatest(coalesce(p_dias, 30), 7), 180);
  v_antes timestamptz;
  v_meta numeric;
begin
  perform calc.exigir_custos(p_estab);
  v_antes := (current_date - v_dias)::timestamptz;
  select coalesce(e.cmv_alvo_padrao, 30) into v_meta from estabelecimentos e where e.id = p_estab;
  return query
  with itens as materialized (  -- uma linha por ficha (o primeiro item do cardápio com preço)
    select distinct on (it.receita_id) it.receita_id, it.id as item_id, coalesce(it.nome_exibicao, r.nome) as produto,
           calc.versao_vigente(it.receita_id) as versao
      from itens_cardapio it
      join cardapios cd on cd.id = it.cardapio_id
      join receitas r on r.id = it.receita_id
     where cd.estabelecimento_id = p_estab and it.ativo and cd.status <> 'arquivado' and r.ativo
     order by it.receita_id, (calc.preco_publicado(it.id) is null), it.criado_em
  ), base as materialized (
    select i.*, calc.grupo_ficha(i.receita_id) as grupo,
           calc.custo_unitario_versao(i.versao, p_estab) as hoje,
           calc.custo_unitario_versao_precos_em(i.versao, p_estab, v_antes) as antes,
           calc.preco_publicado(i.item_id) as preco_hoje,
           coalesce(calc.preco_publicado(i.item_id, v_antes),
                    (select pr.preco from precos_item_cardapio pr where pr.item_id = i.item_id order by pr.vigente_desde limit 1)) as preco_antes
      from itens i where i.versao is not null
  ), m as (
    select b.*, l.atencao_pct, l.alerta_pct, l.critico_pct, l.cmv_atencao_pp, l.cmv_critico_pp,
           case when b.antes > 0 and b.hoje is not null then round(100 * (b.hoje / b.antes - 1), 1) end as var,
           case when b.preco_hoje > 0 and b.hoje is not null then round(100 * b.hoje / b.preco_hoje, 1) end as cmv_h,
           case when b.preco_antes > 0 and b.antes is not null then round(100 * b.antes / b.preco_antes, 1) end as cmv_a
      from base b join public.limites_alerta_casa(p_estab) l on l.grupo = b.grupo
  ), n as (
    select m.*,
           case when m.var >= m.critico_pct then 3 when m.var >= m.alerta_pct then 2 when m.var >= m.atencao_pct then 1 else 0 end as n_custo,
           (m.cmv_a <= v_meta + 0.05 and m.cmv_h > v_meta + 0.05) as cruzou,
           m.cmv_h - m.cmv_a as var_cmv
      from m
  ), f as (
    select n.*,
           case when n.cruzou and n.cmv_h >= v_meta + n.cmv_critico_pp then 3
                when n.cruzou then 2
                when n.var_cmv >= n.cmv_atencao_pp then 1 else 0 end as n_cmv
      from n
  )
  select f.receita_id, f.item_id, f.produto, f.grupo,
         round(f.antes, 4), round(f.hoje, 4), f.var,
         f.preco_hoje, f.cmv_a, f.cmv_h, f.var_cmv, v_meta,
         coalesce(f.cruzou, false), f.n_custo, f.n_cmv, greatest(f.n_custo, f.n_cmv),
         -- insumos da ficha que mais subiram no período (até 3)
         (select string_agg(x.nome || ' +' || replace(to_char(x.pct, 'FM9990.0'), '.', ',') || '%', ', ' order by x.pct desc)
            from (select i.nome, round(100 * (calc.custo_insumo(q.insumo_id, p_estab) / calc.custo_insumo(q.insumo_id, p_estab, v_antes) - 1), 1) as pct
                    from calc.insumos_da_versao(f.versao) q join insumos i on i.id = q.insumo_id
                   where calc.custo_insumo(q.insumo_id, p_estab, v_antes) > 0
                     and calc.custo_insumo(q.insumo_id, p_estab) > calc.custo_insumo(q.insumo_id, p_estab, v_antes) * 1.005
                   order by 2 desc limit 3) x)
    from f
   where greatest(f.n_custo, f.n_cmv) > 0
   order by greatest(f.n_custo, f.n_cmv) desc, f.var desc nulls last, f.produto;
end $$;

create or replace function public.impacto_insumo_fichas(p_insumo uuid, p_estab uuid)
returns table (receita_id uuid, receita text, tipo text, custo_atual numeric, custo_sem_mudanca numeric, impacto_pct numeric, sinal text)
language plpgsql
stable security definer
set search_path = public, calc
as $$
declare
  v_atual numeric := calc.custo_insumo(p_insumo, p_estab);
  v_ant   numeric := calc.custo_insumo_anterior(p_insumo, p_estab);
begin
  perform calc.exigir_custos(p_estab);
  return query
  with x as materialized (
    select r.id, r.nome, r.tipo::text as tipo, calc.versao_vigente(r.id) as versao
      from calc.receitas_dependentes_de_insumo(p_insumo) d join receitas r on r.id = d.receita_id
     where r.ativo and calc.visivel(r.estabelecimento_id, p_estab)
  ), c as materialized (
    select x.*, calc.custo_unitario_versao(x.versao, p_estab) as atual,
           case when v_ant is not null then calc.custo_unitario_versao_troca(x.versao, p_estab, p_insumo, v_ant) end as sem
      from x
  )
  select c.id, c.nome, c.tipo, round(c.atual, 6), round(c.sem, 6),
         case when c.sem > 0 then round(100 * (c.atual - c.sem) / c.sem, 1) end,
         case when c.sem is null or c.atual is null or abs(c.atual - c.sem) <= 0.0005 * c.sem then 'neutro'
              when c.atual < c.sem then 'verde' else 'vermelho' end
    from c
   order by c.tipo desc, c.nome;
end $$;

-- ---------------------------------------------------------------------
-- Custo unitário de várias receitas na casa (lista de fichas e de preparos)
-- Devolve um objeto só { receita_id: custo } (sem o limite de 1000 linhas da API)
-- ---------------------------------------------------------------------
create or replace function public.custos_receitas(p_estab uuid, p_receitas uuid[])
returns jsonb
language plpgsql stable security definer set search_path = public, calc as $$
begin
  perform calc.exigir_custos(p_estab);
  return (select coalesce(jsonb_object_agg(r.id, calc.custo_unitario_receita(r.id, p_estab)), '{}'::jsonb)
            from receitas r
           where r.id = any (p_receitas) and calc.visivel(r.estabelecimento_id, p_estab));
end $$;

-- Insumos usados em versões aprovadas de fichas e preparos visíveis na casa (uma lista só)
create or replace function public.insumos_em_fichas(p_estab uuid)
returns uuid[]
language sql stable set search_path = public, calc as $$
  select coalesce(array_agg(distinct c.insumo_id), '{}')
    from componentes_receita c
    join versoes_receita v on v.id = c.versao_id and v.status = 'aprovada'
    join receitas r on r.id = v.receita_id
   where c.insumo_id is not null and calc.visivel(r.estabelecimento_id, p_estab)
$$;

-- ---------------------------------------------------------------------
-- Leitura das tabelas grandes de preços: a permissão era conferida linha por
-- linha (pode_ver_custos em cada compra). Agora a lista de casas que o usuário
-- vê com custo é montada uma vez por consulta. Mesma regra de antes.
-- ---------------------------------------------------------------------
create or replace function public.casas_com_custos() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(e.id), '{}') from estabelecimentos e where pode_ver_custos(e.id)
$$;
grant execute on function public.casas_com_custos() to authenticated;

drop policy if exists leitura on historico_precos;
create policy leitura on historico_precos for select
  using (estabelecimento_id = any ((select public.casas_com_custos())::uuid[]));
drop policy if exists leitura on itens_importacao;
create policy leitura on itens_importacao for select
  using (estabelecimento_id = any ((select public.casas_com_custos())::uuid[]));
drop policy if exists leitura on conferencias_preco;
create policy leitura on conferencias_preco for select
  using (estabelecimento_id = any ((select public.casas_com_custos())::uuid[]));
drop policy if exists leitura on indicadores_mensais_insumo;
create policy leitura on indicadores_mensais_insumo for select
  using (estabelecimento_id = any ((select public.casas_com_custos())::uuid[]));

-- Compras pendentes da casa (tela Compras) sem ler o histórico inteiro da casa
create index if not exists historico_precos_pendentes
  on historico_precos (estabelecimento_id, data_compra desc) where status = 'pendente';

grant execute on function public.custos_receitas(uuid, uuid[]) to authenticated;
grant execute on function public.insumos_em_fichas(uuid) to authenticated;

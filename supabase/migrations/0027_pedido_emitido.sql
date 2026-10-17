-- =====================================================================
-- 0027 — Pedido da semana: pendente até alguém emitir o PDF
-- Cada contagem gera um pedido. Enquanto ninguém emite o PDF, o pedido fica
-- PENDENTE (vermelho e aviso no menu Estoque para gestores e estoquista).
-- Ao emitir o PDF, grava quem e quando: o pedido fica EMITIDO (verde).
-- Uma contagem nova abre um pedido novo, pendente.
-- Pode rodar de novo.
-- =====================================================================

alter table contagens_estoque add column if not exists pedido_emitido_em timestamptz;
alter table contagens_estoque add column if not exists pedido_emitido_por uuid;

-- Situação do pedido da última contagem da casa
create or replace function public.situacao_pedido_estoque(p_estab uuid)
returns table (contagem_id uuid, feita_em timestamptz, responsavel text, emitido_em timestamptz, emitido_por text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tem_acesso(p_estab) then
    raise exception 'Sem acesso a esta casa' using errcode = 'insufficient_privilege';
  end if;
  return query
  select c.id, c.criado_em, coalesce(pc.nome, 'Usuário não identificado'), c.pedido_emitido_em,
         case when c.pedido_emitido_em is not null then coalesce(pe.nome, 'Usuário não identificado') end
    from contagens_estoque c
    left join perfis pc on pc.user_id = c.criado_por
    left join perfis pe on pe.user_id = c.pedido_emitido_por
   where c.estabelecimento_id = p_estab
   order by c.data desc, c.criado_em desc
   limit 1;
end $$;
grant execute on function public.situacao_pedido_estoque(uuid) to authenticated;

-- Emitir o PDF do pedido: marca como emitido (só na primeira vez; quem conta não emite)
create or replace function public.marcar_pedido_emitido(p_estab uuid, p_contagem uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(papel_em(p_estab), '') not in ('admin', 'gestor', 'gerente', 'estoquista') then
    raise exception 'Só gestor, gerência ou estoquista emitem o pedido' using errcode = 'insufficient_privilege';
  end if;
  update contagens_estoque
     set pedido_emitido_em = now(), pedido_emitido_por = auth.uid()
   where id = p_contagem and estabelecimento_id = p_estab and pedido_emitido_em is null;
end $$;
grant execute on function public.marcar_pedido_emitido(uuid, uuid) to authenticated;

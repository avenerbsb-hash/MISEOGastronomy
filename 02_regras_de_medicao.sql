-- =====================================================================
-- Seed 02 · Regras de medição definidas em 15/10/2026
-- Rodar depois da migração 0003 (e do seed 01). Pode rodar mais de uma vez.
-- =====================================================================
begin;

-- Mel é medido em mL (só troca se ainda não houver preço lançado)
update insumos set dimensao = 'volume'
 where codigo = 'MEL-001'
   and not exists (select 1 from historico_precos h where h.insumo_id = insumos.id);

-- Ovos (por unidade), mel (mL), burrata avulsa (g) e caixas/peças de peso variável:
-- sem conversão fixa; a quantidade real é lançada no recebimento
update alias_insumo a
   set medir_no_recebimento = true,
       quantidade_por_un    = null,
       unidade              = case i.dimensao when 'massa' then 'kg' when 'volume' then 'ml' else 'un' end
  from insumos i
 where i.id = a.insumo_id
   and a.quantidade_por_un is null
   and i.codigo in ('OVO-001','OVO-004','MEL-001','LAT-010','SUI-003','EMB-001','EMB-007','EMB-008','EMB-011');

-- As 34 linhas antigas dessas notas não têm pesagem/contagem registrada:
-- ficam guardadas como 'ignorado'. O custo desses itens passa a valer
-- a partir do próximo recebimento lançado com a quantidade real.
-- (Se alguém tiver a pesagem de uma nota antiga: select registrar_recebimento(<id do item>, <quantidade>, '<kg|g|ml|un>');)
update itens_importacao
   set status = 'ignorado',
       motivo_pendencia = 'Quantidade variável sem pesagem/contagem registrada; custo começa no próximo recebimento'
 where status = 'pendente'
   and lote_importacao = 'xfacil-giuli-2026-10-13';

commit;

-- Conferência: itens que agora são medidos no recebimento
select i.codigo, i.nome, i.dimensao, a.descricao_original, a.unidade as unidade_de_lancamento
  from alias_insumo a join insumos i on i.id = a.insumo_id
 where a.medir_no_recebimento
 order by i.codigo;

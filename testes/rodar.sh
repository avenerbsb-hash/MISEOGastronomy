#!/usr/bin/env bash
# Sobe Postgres 16 descartáveis, aplica as migrações e roda: (1) casos de aceite, (2) seed do Giuli.
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN=/usr/lib/postgresql/16/bin
DATA=$(mktemp -d)
chown postgres "$DATA"
su postgres -c "$PGBIN/initdb -D $DATA -A trust -E UTF8 --locale=C.UTF-8" >/dev/null
su postgres -c "$PGBIN/pg_ctl -D $DATA -o '-p 54329 -k /tmp' -l $DATA/log start -w" >/dev/null
trap 'su postgres -c "$PGBIN/pg_ctl -D $DATA stop -m fast" >/dev/null; rm -rf $DATA' EXIT
P="psql -h /tmp -p 54329 -U postgres -v ON_ERROR_STOP=1 -q"
filtro() { { grep -E "OK |==|ERROR|FALHOU" || true; } | sed "s/^psql:[^ ]* NOTICE:  //"; }
for db in aceite seed medicao; do
  $P -d postgres -c "create database $db"
  $P -d $db -f testes/00_stub_supabase.sql
  for m in supabase/migrations/*.sql; do $P -d $db -f "$m"; done
done
$P -d aceite -f testes/10_casos_de_aceite.sql 2>&1 | filtro
$P -d aceite -f testes/40_cmv_referencia.sql 2>&1 | filtro
$P -d aceite -f testes/50_correcoes_0005.sql 2>&1 | filtro
$P -d aceite -f testes/60_correcoes_0006.sql 2>&1 | filtro
$P -d aceite -f testes/80_variacao_fichas.sql 2>&1 | filtro
$P -d aceite -f testes/90_alertas_aumento.sql 2>&1 | filtro
$P -d aceite -f testes/95_impacto_insumo.sql 2>&1 | filtro
$P -d aceite -f testes/97_fornecedores_insumo.sql 2>&1 | filtro
$P -d aceite -f testes/98_painel_cmv_casa.sql 2>&1 | filtro
$P -d aceite -f testes/99_inteligencia_precos.sql 2>&1 | filtro
$P -d aceite -f testes/100_estrutura_custos.sql 2>&1 | filtro
$P -d aceite -f testes/101_acumulado_anual.sql 2>&1 | filtro
$P -d aceite -f testes/102_estorno_compra.sql 2>&1 | filtro
$P -d aceite -f testes/103_custo_media_notas.sql 2>&1 | filtro
$P -d seed -f supabase/seed/01_insumos_giuli.sql 2>&1 | filtro
$P -d seed -f testes/20_seed_giuli.sql 2>&1 | filtro
$P -d seed -f supabase/seed/03_categorias.sql >/dev/null
$P -d seed -f supabase/seed/03_categorias.sql >/dev/null
$P -d seed -f testes/70_categorias.sql 2>&1 | filtro
$P -d medicao -f supabase/seed/01_insumos_giuli.sql 2>&1 | filtro
$P -d medicao -f supabase/seed/02_regras_de_medicao.sql >/dev/null
$P -d medicao -f testes/30_recebimento.sql 2>&1 | filtro

# Fichas Técnicas — banco do MVP

Ordem para aplicar no Supabase (SQL Editor ou `supabase db push`):
1. `supabase/migrations/0001_fichas_tecnicas.sql` — tabelas, regras, cálculo, segurança.
2. `supabase/migrations/0002_importacao_e_referencia.sql` — itens de nota importados, preço de referência entre casas.
3. `supabase/migrations/0003_recebimento_quantidade_variavel.sql` — itens medidos no recebimento, função registrar_recebimento.
4. `supabase/migrations/0004_cmv_referencia_por_item.sql` — CMV de referência por item, sugestão mantendo CMV e mantendo margem, CMV médio da casa.
5. `supabase/migrations/0005_correcoes_revisao.sql` — unidade do lote validada, painel de CMV sem divisão por zero, bonificação (nota R$ 0) fora do custo, permissão de confirmar_conversao.
6. `supabase/seed/01_insumos_giuli.sql` — 5 casas, 71 insumos, 362 linhas de nota do Giuli; referência para as demais casas. Rodar uma vez.
7. `supabase/seed/02_regras_de_medicao.sql` — ovos por unidade, mel em mL, caixas e peças de peso variável lançadas com a quantidade medida.

Já rodou 0001, 0002 e o seed 01? Rode só 0003, 0004, 0005 e o seed 02 (0004 e 0005 podem vir antes ou depois dos seeds).
Já rodou tudo até a 0004? Rode só a 0005.

Testes locais: `testes/rodar.sh` (Postgres 16 descartável). Saída esperada: "TODOS OS TESTES PASSARAM", "CMV DE REFERÊNCIA OK", "CORREÇÕES 0005 OK", "SEED OK" e "RECEBIMENTO OK".
`ferramentas/` tem o leitor do PDF do xFácil e as regras de agrupamento usadas para gerar o seed.

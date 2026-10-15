# MISEO — Fichas Técnicas e Cardápios (Grupo JF+)

## App (Next.js 15)

1. Copie `.env.example` para `.env.local` e preencha `NEXT_PUBLIC_SUPABASE_URL` e
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API; nunca a chave secreta).
2. `npm install` e `npm run dev` → http://localhost:3000
3. Entre com um usuário do Supabase que tenha linha em `perfis` (admin) ou em `acessos_estabelecimento`.

Fatia 1: login, seletor de casa, Insumos (custo, variação, compras, validação, histórico, fichas impactadas),
Pendências (validação e notas aguardando pesagem) e Subprodutos (rascunho com prévia de custo, aprovação,
versões e lotes). Todo custo e CMV vem das funções do banco; a equipe de produção só vê `vw_ficha_producao`.
Deploy: Vercel, com as mesmas duas variáveis de ambiente.

## Banco

Ordem para aplicar no Supabase (SQL Editor ou `supabase db push`):
1. `supabase/migrations/0001_fichas_tecnicas.sql` — tabelas, regras, cálculo, segurança.
2. `supabase/migrations/0002_importacao_e_referencia.sql` — itens de nota importados, preço de referência entre casas.
3. `supabase/migrations/0003_recebimento_quantidade_variavel.sql` — itens medidos no recebimento, função registrar_recebimento.
4. `supabase/migrations/0004_cmv_referencia_por_item.sql` — CMV de referência por item, sugestão mantendo CMV e mantendo margem, CMV médio da casa.
5. `supabase/migrations/0005_correcoes_revisao.sql` — unidade do lote validada, painel de CMV sem divisão por zero, bonificação (nota R$ 0) fora do custo, permissão de confirmar_conversao.
6. `supabase/migrations/0006_historico_e_permissoes.sql` — compra própria prevalece sobre referência, dimensão/densidade protegidas (quantidade convertida congelada na aprovação), status de versão e data retroativa só pelo admin.
7. `supabase/seed/01_insumos_giuli.sql` — 5 casas, 71 insumos, 362 linhas de nota do Giuli; referência para as demais casas. Rodar uma vez.
8. `supabase/seed/02_regras_de_medicao.sql` — ovos por unidade, mel em mL, caixas e peças de peso variável lançadas com a quantidade medida.

Já rodou 0001, 0002 e o seed 01? Rode só 0003 a 0006 e o seed 02 (0004 a 0006 podem vir antes ou depois dos seeds).
Já rodou tudo até a 0005? Rode só a 0006.

Testes locais: `testes/rodar.sh` (Postgres 16 descartável). Saída esperada: "TODOS OS TESTES PASSARAM", "CMV DE REFERÊNCIA OK", "CORREÇÕES 0005 OK", "CORREÇÕES 0006 OK", "SEED OK" e "RECEBIMENTO OK". O GitHub Actions roda os mesmos testes a cada envio.
No Windows (com o PostgreSQL 16 instalado): `powershell -ExecutionPolicy Bypass -File testes\rodar.ps1` — termina com "TUDO OK" ou "TESTES FALHARAM".
`ferramentas/` tem o leitor do PDF do xFácil e as regras de agrupamento usadas para gerar o seed.

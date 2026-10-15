
MISEO — Fichas Técnicas e Cardápios (Grupo JF+)
App (Next.js 15): copie .env.example para .env.local e preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (Project Settings → API; nunca a chave secreta). Depois: npm install e npm run dev (http://localhost:3000). Entre com um usuário que tenha linha em perfis (admin) ou em acessos_estabelecimento. Todo custo e CMV vem das funções do banco; a produção só vê vw_ficha_producao. Deploy na Vercel com as mesmas duas variáveis.
Banco — ordem para aplicar no Supabase (SQL Editor ou supabase db push):
supabase/migrations/0001_fichas_tecnicas.sql — tabelas, regras, cálculo, segurança.
supabase/migrations/0002_importacao_e_referencia.sql — itens de nota importados, preço de referência entre casas.
supabase/migrations/0003_recebimento_quantidade_variavel.sql — itens medidos no recebimento, função registrar_recebimento.
supabase/migrations/0004_cmv_referencia_por_item.sql — CMV de referência por item, sugestão mantendo CMV e mantendo margem, CMV médio da casa.
supabase/migrations/0005_correcoes_revisao.sql — unidade do lote validada, painel de CMV sem divisão por zero, bonificação (nota R$ 0) fora do custo, permissão de confirmar_conversao.
supabase/migrations/0006_historico_e_permissoes.sql — compra própria prevalece sobre referência, dimensão/densidade protegidas (quantidade convertida congelada na aprovação), status de versão e data retroativa só pelo admin.
supabase/seed/01_insumos_giuli.sql — 5 casas, 71 insumos, 362 linhas de nota do Giuli; referência para as demais casas. Rodar uma vez.
supabase/seed/02_regras_de_medicao.sql — ovos por unidade, mel em mL, caixas e peças de peso variável lançadas com a quantidade medida.
supabase/seed/03_categorias.sql — árvore padrão de categorias de insumos e receitas. Pode rodar mais de uma vez.
Já rodou 0001, 0002 e o seed 01? Rode só 0003 a 0006 e o seed 02 (0004 a 0006 podem vir antes ou depois dos seeds).
Já rodou tudo até a 0005? Rode só a 0006.
Testes locais: testes/rodar.sh (Postgres 16 descartável). Saída esperada: "TODOS OS TESTES PASSARAM", "CMV DE REFERÊNCIA OK", "CORREÇÕES 0005 OK", "CORREÇÕES 0006 OK", "SEED OK", "CATEGORIAS OK" e "RECEBIMENTO OK". O GitHub Actions roda os mesmos testes a cada envio.
No Windows (com o PostgreSQL 16 instalado): powershell -ExecutionPolicy Bypass -File testes\rodar.ps1 — termina com "TUDO OK" ou "TESTES FALHARAM".
ferramentas/ tem o leitor do PDF do xFácil e as regras de agrupamento usadas para gerar o seed.

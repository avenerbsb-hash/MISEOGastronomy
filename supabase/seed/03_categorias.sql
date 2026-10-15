-- =====================================================================
-- Seed 03 · Árvore padrão de categorias (insumos e receitas)
-- Grupo JF+: bar, restaurante, osteria e sushi. Pode rodar mais de uma vez
-- (só insere o que ainda não existe). Não altera as categorias já usadas
-- pelos insumos do seed 01 (Proteínas e laticínios › ...).
-- =====================================================================
begin;

create temporary table _arvore (escopo text, grupo text, sub text) on commit drop;

insert into _arvore (escopo, grupo, sub) values
  -- ------------------------------------------------------------- INSUMOS
  ('insumo', 'Proteínas e laticínios', 'Cordeiro e caprino'),
  ('insumo', 'Proteínas e laticínios', 'Proteínas vegetais (tofu, PTS)'),

  ('insumo', 'Hortifrúti', 'Folhas e verduras'),
  ('insumo', 'Hortifrúti', 'Legumes'),
  ('insumo', 'Hortifrúti', 'Raízes e tubérculos'),
  ('insumo', 'Hortifrúti', 'Frutas'),
  ('insumo', 'Hortifrúti', 'Cítricos'),
  ('insumo', 'Hortifrúti', 'Ervas frescas'),
  ('insumo', 'Hortifrúti', 'Cogumelos'),
  ('insumo', 'Hortifrúti', 'Brotos, microverdes e flores comestíveis'),
  ('insumo', 'Hortifrúti', 'Bulbos (alho, cebola, alho-poró)'),

  ('insumo', 'Mercearia', 'Arroz e grãos'),
  ('insumo', 'Mercearia', 'Feijões e leguminosas'),
  ('insumo', 'Mercearia', 'Farinhas, amidos e fubá'),
  ('insumo', 'Mercearia', 'Massas secas'),
  ('insumo', 'Mercearia', 'Açúcares e adoçantes'),
  ('insumo', 'Mercearia', 'Sal'),
  ('insumo', 'Mercearia', 'Especiarias e temperos secos'),
  ('insumo', 'Mercearia', 'Azeites e óleos'),
  ('insumo', 'Mercearia', 'Vinagres'),
  ('insumo', 'Mercearia', 'Molhos e condimentos prontos'),
  ('insumo', 'Mercearia', 'Conservas, enlatados e antepastos'),
  ('insumo', 'Mercearia', 'Tomates processados (pelado, passata, extrato)'),
  ('insumo', 'Mercearia', 'Castanhas, nozes e sementes'),
  ('insumo', 'Mercearia', 'Frutas secas e desidratadas'),
  ('insumo', 'Mercearia', 'Chocolates e cacau'),
  ('insumo', 'Mercearia', 'Confeitaria (gelatina, essências, corantes)'),
  ('insumo', 'Mercearia', 'Fermentos e aditivos'),
  ('insumo', 'Mercearia', 'Caldos e bases prontas'),
  ('insumo', 'Mercearia', 'Ingredientes orientais (shoyu, nori, wasabi, missô)'),
  ('insumo', 'Mercearia', 'Ingredientes mexicanos e latinos'),
  ('insumo', 'Mercearia', 'Snacks e petiscos industrializados'),

  ('insumo', 'Padaria e massas frescas', 'Pães'),
  ('insumo', 'Padaria e massas frescas', 'Massas frescas e recheadas'),
  ('insumo', 'Padaria e massas frescas', 'Massas folhadas e de pizza'),
  ('insumo', 'Padaria e massas frescas', 'Tortilhas e wraps'),

  ('insumo', 'Congelados', 'Vegetais congelados'),
  ('insumo', 'Congelados', 'Batatas pré-fritas'),
  ('insumo', 'Congelados', 'Polpas de fruta'),
  ('insumo', 'Congelados', 'Sorvetes e gelatos'),
  ('insumo', 'Congelados', 'Salgados e pratos congelados'),

  ('insumo', 'Bebidas', 'Águas'),
  ('insumo', 'Bebidas', 'Refrigerantes'),
  ('insumo', 'Bebidas', 'Tônicas e mixers (soda, ginger ale)'),
  ('insumo', 'Bebidas', 'Sucos e néctares'),
  ('insumo', 'Bebidas', 'Energéticos e isotônicos'),
  ('insumo', 'Bebidas', 'Café'),
  ('insumo', 'Bebidas', 'Chás e infusões'),
  ('insumo', 'Bebidas', 'Gelo'),
  ('insumo', 'Bebidas', 'Cervejas'),
  ('insumo', 'Bebidas', 'Chope'),
  ('insumo', 'Bebidas', 'Vinhos tintos'),
  ('insumo', 'Bebidas', 'Vinhos brancos'),
  ('insumo', 'Bebidas', 'Vinhos rosés'),
  ('insumo', 'Bebidas', 'Espumantes e champanhes'),
  ('insumo', 'Bebidas', 'Vinhos de sobremesa e fortificados (Porto, Jerez)'),
  ('insumo', 'Bebidas', 'Saquês'),
  ('insumo', 'Bebidas', 'Destilados · Gin'),
  ('insumo', 'Bebidas', 'Destilados · Vodka'),
  ('insumo', 'Bebidas', 'Destilados · Rum'),
  ('insumo', 'Bebidas', 'Destilados · Cachaça'),
  ('insumo', 'Bebidas', 'Destilados · Whisky'),
  ('insumo', 'Bebidas', 'Destilados · Tequila e mezcal'),
  ('insumo', 'Bebidas', 'Destilados · Conhaque e brandy'),
  ('insumo', 'Bebidas', 'Destilados · Grappa e outros'),
  ('insumo', 'Bebidas', 'Licores'),
  ('insumo', 'Bebidas', 'Vermutes e aperitivos'),
  ('insumo', 'Bebidas', 'Bitters'),
  ('insumo', 'Bebidas', 'Xaropes e siropes de bar'),

  ('insumo', 'Descartáveis e embalagens', 'Embalagens para delivery'),
  ('insumo', 'Descartáveis e embalagens', 'Copos, canudos e mexedores'),
  ('insumo', 'Descartáveis e embalagens', 'Guardanapos e papéis'),
  ('insumo', 'Descartáveis e embalagens', 'Filme PVC, alumínio e sacos'),
  ('insumo', 'Descartáveis e embalagens', 'Luvas, toucas e EPI'),
  ('insumo', 'Descartáveis e embalagens', 'Etiquetas e bobinas'),

  ('insumo', 'Limpeza e higiene', 'Detergentes e desengordurantes'),
  ('insumo', 'Limpeza e higiene', 'Sanitizantes e desinfetantes'),
  ('insumo', 'Limpeza e higiene', 'Panos, esponjas e fibras'),
  ('insumo', 'Limpeza e higiene', 'Sacos de lixo'),
  ('insumo', 'Limpeza e higiene', 'Higiene pessoal (sabonete, papel toalha)'),

  -- ------------------------------------------------------------- RECEITAS
  ('receita', 'Subprodutos', 'Molhos'),
  ('receita', 'Subprodutos', 'Caldos e fundos'),
  ('receita', 'Subprodutos', 'Carnes limpas e porcionadas'),
  ('receita', 'Subprodutos', 'Peixes limpos e porcionados'),
  ('receita', 'Subprodutos', 'Marinadas e temperos'),
  ('receita', 'Subprodutos', 'Massas, bases e recheios'),
  ('receita', 'Subprodutos', 'Pães e fermentações'),
  ('receita', 'Subprodutos', 'Arroz de sushi e bases orientais'),
  ('receita', 'Subprodutos', 'Guarnições'),
  ('receita', 'Subprodutos', 'Conservas e picles'),
  ('receita', 'Subprodutos', 'Cremes e bases de confeitaria'),
  ('receita', 'Subprodutos', 'Xaropes, cordiais e preparos de bar'),
  ('receita', 'Subprodutos', 'Sucos e purês preparados'),

  ('receita', 'Fichas finais', 'Entradas'),
  ('receita', 'Fichas finais', 'Saladas'),
  ('receita', 'Fichas finais', 'Petiscos e porções'),
  ('receita', 'Fichas finais', 'Pratos principais'),
  ('receita', 'Fichas finais', 'Massas'),
  ('receita', 'Fichas finais', 'Risotos'),
  ('receita', 'Fichas finais', 'Pizzas'),
  ('receita', 'Fichas finais', 'Sanduíches e burgers'),
  ('receita', 'Fichas finais', 'Sushi, sashimi e temaki'),
  ('receita', 'Fichas finais', 'Pratos quentes orientais'),
  ('receita', 'Fichas finais', 'Acompanhamentos'),
  ('receita', 'Fichas finais', 'Sobremesas'),
  ('receita', 'Fichas finais', 'Menu infantil'),
  ('receita', 'Fichas finais', 'Drinks clássicos'),
  ('receita', 'Fichas finais', 'Drinks autorais'),
  ('receita', 'Fichas finais', 'Drinks sem álcool'),
  ('receita', 'Fichas finais', 'Doses e garrafas'),
  ('receita', 'Fichas finais', 'Cafés e bebidas quentes');

-- Grupos (nível 1)
insert into categorias (nome, escopo)
select distinct a.grupo, a.escopo
  from _arvore a
 where not exists (select 1 from categorias c
                    where c.escopo = a.escopo and c.nome = a.grupo and c.pai_id is null);

-- Subcategorias (nível 2)
insert into categorias (nome, escopo, pai_id)
select a.sub, a.escopo, g.id
  from _arvore a
  join categorias g on g.escopo = a.escopo and g.nome = a.grupo and g.pai_id is null
 where not exists (select 1 from categorias c
                    where c.escopo = a.escopo and c.nome = a.sub and c.pai_id = g.id);

commit;

-- Conferência: quantas categorias em cada grupo
select g.escopo, g.nome as grupo, count(s.id) as subcategorias
  from categorias g
  left join categorias s on s.pai_id = g.id
 where g.pai_id is null
 group by g.escopo, g.nome
 order by g.escopo, g.nome;

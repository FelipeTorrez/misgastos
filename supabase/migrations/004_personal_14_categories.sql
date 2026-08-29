-- MisGastos — 004 Personal 14 categories
-- Transicion 14 genericas -> 14 personales.
--  * alimentacion (Alimentación)  -> supermercado  (comida/insumos del hogar)
--  * educacion   (Educación)      -> otros
--  * hogar (Hogar y Aseo) y ahorro (Ahorro) se crean como categorias NUEVAS
--  * transferencias se mantiene (transfer) separada de ahorro (income)
-- Idempotente (guards where-not-exists) por si se re-corre manualmente.

-- 1. Renombres visibles (keep slug -> no rompe FK ni rules)
update categories set name='Restaurantes y Café' where slug='restaurantes' and is_system=true;
update categories set name='Diversión'           where slug='entretenimiento' and is_system=true;

-- 2. Remapear alimentacion -> supermercado
update transactions set category_id=(select id from categories where slug='supermercado' and is_system=true limit 1)
where category_id=(select id from categories where slug='alimentacion' and is_system=true limit 1);
update budgets set category_id=(select id from categories where slug='supermercado' and is_system=true limit 1)
where category_id=(select id from categories where slug='alimentacion' and is_system=true limit 1);
update rules set preferred_category_id=(select id from categories where slug='supermercado' and is_system=true limit 1)
where preferred_category_id=(select id from categories where slug='alimentacion' and is_system=true limit 1);

-- 3. Borrar alimentacion
delete from categories where slug='alimentacion' and is_system=true;

-- 4. Remapear educacion -> otros
update transactions set category_id=(select id from categories where slug='otros' and is_system=true limit 1)
where category_id=(select id from categories where slug='educacion' and is_system=true limit 1);
update budgets set category_id=(select id from categories where slug='otros' and is_system=true limit 1)
where category_id=(select id from categories where slug='educacion' and is_system=true limit 1);
update rules set preferred_category_id=(select id from categories where slug='otros' and is_system=true limit 1)
where preferred_category_id=(select id from categories where slug='educacion' and is_system=true limit 1);

-- 5. Borrar educacion
delete from categories where slug='educacion' and is_system=true;

-- 6. Nuevas categorias
insert into categories (name, slug, type, is_system)
select 'Hogar y Aseo','hogar','expense',true
where not exists (select 1 from categories where slug='hogar' and is_system=true);

insert into categories (name, slug, type, is_system)
select 'Ahorro','ahorro','income',true
where not exists (select 1 from categories where slug='ahorro' and is_system=true);

-- Verificacion (deberian quedar 14 de sistema):
-- select slug, name, type from categories where is_system=true order by slug;

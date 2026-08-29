-- MisGastos — 005 Renombrar categoría de sistema 'supermercado' -> 'alimentacion'
-- Mantiene la misma fila (mismo UUID de categoría) e iconografía en mobile:
-- solo cambian slug + name. No hay que remapear transactions/budgets/rules
-- porque todas referencian category_id (UUID), no el slug.
-- Idempotente: si ya no existe 'supermercado', no hace nada.

update categories set slug = 'alimentacion', name = 'Alimentación'
where slug = 'supermercado' and is_system = true and user_id is null;

-- Verificación (debería existir 1 fila 'alimentacion' is_system):
-- select slug, name, type from categories where is_system = true order by slug;

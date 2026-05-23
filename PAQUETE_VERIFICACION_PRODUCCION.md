# Paquete de Verificacion Produccion

## Objetivo

Preparar la fase de contraste real con produccion usando consultas y verificaciones concretas para llenar:

- `ESTADO_FINAL_POR_TABLA.md`

Este paquete no aplica cambios.

Solo sirve para inspeccionar y decidir.

## Regla de seguridad

Antes de ejecutar cualquier cosa en produccion:

1. solo consultas de lectura
2. no aplicar `DROP`, `CREATE`, `ALTER`, `UPDATE`, `DELETE`
3. guardar resultado bruto si es posible

## Orden recomendado

1. `sales_limits`
2. `tickets`
3. `winning_tickets`
4. `profiles`
5. `ticket_numbers`
6. `lotteries`
7. `draw_times`
8. `settlements`
9. `winning_numbers`
10. `system_config`

## Consulta base de politicas

Ejecutar una vez:

```sql
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

## Consulta base de triggers

Ejecutar una vez:

```sql
select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
order by event_object_table, trigger_name;
```

## Consulta base de funciones sensibles

Ejecutar una vez:

```sql
select
  n.nspname as schema_name,
  p.proname as function_name,
  p.prosecdef as security_definer,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_admin_daily_sales',
    'get_numbers_for_admin',
    'get_winning_tickets',
    'get_winning_tickets_summary',
    'get_seller_balance',
    'get_seller_balance_detail',
    'get_all_sellers_balance',
    'setup_new_user',
    'delete_seller',
    'delete_admin_cascade',
    'change_user_password',
    'update_admin_profile'
  )
order by p.proname;
```

## Verificacion por tabla

## 1. `sales_limits`

### Politicas

```sql
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'sales_limits'
order by policyname;
```

### Estructura util

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'sales_limits'
order by ordinal_position;
```

### Preguntas a responder

- existe politica de `SELECT` para vendedor o red del admin
- `sub_admin` aparece o no
- `lottery_id` permite `NULL`

### Marcar en tablero

- `coincide con produccion` si la lectura real para vendedor existe y el alcance es razonable
- `ajustar antes de versionar` si existe pero no coincide con el candidato
- `no tocar aun` si depende de otra capa no clara

## 2. `tickets`

### Politicas

```sql
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'tickets'
order by policyname;
```

### Triggers

```sql
select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table = 'tickets'
order by trigger_name;
```

### Preguntas a responder

- `sub_admin` aparece en lectura
- vendedor puede hacer `UPDATE` directo
- si hay trigger que limite columnas
- si el insert valida coherencia entre `seller_id` y `admin_id`

### Marcar en tablero

- `coincide con produccion` si alcance y endurecimiento real existen
- `ajustar antes de versionar` si falta parte del candidato

## 3. `winning_tickets`

### Politicas

```sql
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'winning_tickets'
order by policyname;
```

### Triggers

```sql
select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table = 'winning_tickets'
order by trigger_name;
```

### Preguntas a responder

- `sub_admin` participa o no
- vendedor puede actualizar premios
- si update esta limitado por otra capa

### Marcar en tablero

- `coincide con produccion` si el alcance real esta claro y seguro
- `ajustar antes de versionar` si el update sigue demasiado abierto

## 4. `profiles`

### Politicas

```sql
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
order by policyname;
```

### Columnas utiles

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
order by ordinal_position;
```

### Preguntas a responder

- `sub_admin_id` esta en uso real
- `sub_admin` aparece en lectura
- admin puede actualizar demasiado

### Marcar en tablero

- `coincide con produccion` si el alcance real de red queda claro
- `ajustar antes de versionar` si el candidato necesita correccion

## 5. `ticket_numbers`

### Politicas

```sql
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'ticket_numbers'
order by policyname;
```

### Preguntas a responder

- depende solo de `tickets`
- hay `UPDATE` o no
- `sub_admin` aparece indirectamente

## 6. `lotteries`

### Politicas

```sql
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'lotteries'
order by policyname;
```

### Preguntas a responder

- vendedor lee por admin padre
- `sub_admin` aparece o se hereda
- loterias globales siguen visibles

## 7. `draw_times`

### Politicas

```sql
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'draw_times'
order by policyname;
```

### Columnas utiles

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'draw_times'
order by ordinal_position;
```

### Preguntas a responder

- acceso cuelga de loterias
- `admin_id` no existe y la politica no lo necesita

## 8. `settlements`

### Politicas

```sql
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'settlements'
order by policyname;
```

### Preguntas a responder

- `sub_admin` participa o no
- hay solo insert o tambien update/delete

## 9. `winning_numbers`

### Politicas

```sql
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'winning_numbers'
order by policyname;
```

### Preguntas a responder

- usan delete+insert o update
- delete esta permitido para admin del sorteo

## 10. `system_config`

### Politicas

```sql
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'system_config'
order by policyname;
```

### Preguntas a responder

- solo `super_admin` escribe
- hace falta insert/delete o solo update

## Como llenar `ESTADO_FINAL_POR_TABLA.md`

### Usar `coincide con produccion` cuando:

- la politica real ya cubre el comportamiento correcto
- el candidato no aporta cambio relevante

### Usar `ajustar antes de versionar` cuando:

- produccion y candidato apuntan a lo mismo
- pero hay diferencias de detalle que todavia debemos corregir

### Usar `no tocar aun` cuando:

- la tabla depende de triggers, RPCs o capas que aun no entendemos del todo

### Usar `pendiente de confirmar` cuando:

- aun no se reviso la evidencia real

## Resultado esperado

Terminar con evidencia suficiente para decidir por cada tabla:

1. versionar ya
2. ajustar candidato
3. dejar quieta por ahora

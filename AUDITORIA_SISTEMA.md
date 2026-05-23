# Auditoria del Sistema de Loteria

## Objetivo

Validar que el frontend actual, las migraciones SQL y la base de datos real esten alineados antes de hacer cambios estructurales.

Esta auditoria busca responder una sola pregunta:

`Que es la verdad real del sistema hoy: el codigo del frontend, el schema.sql del repo, o la base de datos que ya esta funcionando?`

## Regla de seguridad

Antes de cambiar codigo o SQL:

1. No modificar produccion sin respaldo.
2. No aplicar migraciones nuevas hasta comparar contra la base real.
3. Tratar `database/schema.sql` como referencia parcial, no como verdad absoluta.

## Hallazgo principal

El frontend actual usa campos, roles y RPCs que no aparecen en `database/schema.sql`.

Eso no significa necesariamente que la aplicacion este rota.

Significa que probablemente ocurre una de estas dos cosas:

1. La base real tiene migraciones aplicadas que no quedaron reflejadas en el repo.
2. El repo mezcla una version vieja del schema con una version mas nueva del frontend.

## Resultado real de la auditoria

Se verifico conexion real contra la base de datos configurada por el proyecto.

### Confirmado en la base real

La base real SI contiene columnas avanzadas que el frontend usa y que no aparecen en `database/schema.sql`.

#### `profiles`

Confirmadas:

- `expires_at`
- `max_sellers`
- `sub_admin_id`
- `seller_code`
- `price_2_digits_override`
- `price_4_digits_override`
- `use_global_limits`

#### `lotteries`

Confirmadas:

- `lottery_modality`
- `billete_prize_1st_multiplier`
- `billete_prize_2nd_multiplier`
- `billete_prize_3rd_multiplier`
- `nat_mult_3match_1`
- `nat_mult_2first_1`
- `nat_mult_1last_1`

#### `sales_limits`

Confirmado:

- existen filas reales con `lottery_id = null`
- la base real SI soporta limites globales

#### `winning_tickets`

Confirmado:

- la tabla existe en la base real

#### `winning_numbers`

Confirmado:

- la tabla existe y responde con los campos usados por el frontend

### Inconsistencia real detectada

#### `draw_times.admin_id`

Se verifico que:

- consultar `draw_times` con campos basicos funciona
- consultar `draw_times.admin_id` devuelve error

Esto indica que el frontend probablemente esta asumiendo una columna que no existe en la base real.

Archivo afectado:

- `src/pages/admin/ManageLimits.jsx`

### Conclusion real actualizada

La aplicacion no parece estar apoyada en una base incompleta.

La evidencia apunta a esto:

1. La base real esta mas avanzada que `database/schema.sql`
2. El repo tiene al menos un schema base desactualizado
3. Hay algunos puntos puntuales de codigo que si merecen correccion, especialmente donde el frontend asume columnas no reales

### Implicacion practica

No se recomienda rehacer la base “para que coincida con el schema.sql”.

La prioridad correcta es:

1. tomar la base real como referencia operativa
2. actualizar el repo para reflejar esa realidad
3. corregir solo los desajustes confirmados

### Documentacion relacionada

Para la capa de funciones RPC usadas por la aplicacion, ver:

- `RPCS_SISTEMA.md`

### Estado de confianza por area

- Alta confianza:
  - `profiles` extendido
  - `lotteries` avanzadas
  - `sales_limits` con limites globales
  - `winning_tickets`

- Riesgo puntual:
  - queries que usen `draw_times.admin_id`

- Aun pendiente de cierre fino:
  - inventario completo de RPCs existentes

## Fase 1: Inventario de la base real

Ejecutar estas consultas en InsForge SQL Editor o en la herramienta que uses para inspeccionar PostgreSQL.

### 1.1 Columnas reales por tabla

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'profiles',
    'lotteries',
    'draw_times',
    'tickets',
    'ticket_numbers',
    'sales_limits',
    'winning_numbers',
    'winning_tickets'
  )
order by table_name, ordinal_position;
```

### 1.2 Constraints reales

```sql
select
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type
from information_schema.table_constraints tc
where tc.table_schema = 'public'
  and tc.table_name in (
    'profiles',
    'lotteries',
    'draw_times',
    'tickets',
    'ticket_numbers',
    'sales_limits',
    'winning_numbers',
    'winning_tickets'
  )
order by tc.table_name, tc.constraint_type, tc.constraint_name;
```

### 1.3 Definicion de funciones RPC

```sql
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_profile_codes',
    'setup_new_user',
    'update_admin_profile',
    'change_user_password',
    'delete_admin_cascade',
    'delete_seller',
    'get_admin_daily_sales',
    'generate_winning_tickets',
    'get_winning_tickets',
    'get_winning_tickets_summary',
    'get_seller_winning_tickets',
    'get_subadmin_winning_tickets',
    'get_subadmin_sellers',
    'get_lottery_billete_multipliers',
    'update_lottery_multipliers',
    'update_lottery_prices',
    'update_national_config',
    'deactivate_lottery',
    'reactivate_lottery'
  )
order by p.proname;
```

### 1.4 Politicas RLS reales

```sql
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'lotteries',
    'draw_times',
    'tickets',
    'ticket_numbers',
    'sales_limits',
    'winning_numbers',
    'winning_tickets'
  )
order by tablename, policyname;
```

## Fase 2: Comparacion contra lo que espera el frontend

### 2.1 `profiles`

El frontend espera estos campos:

- `role` incluyendo `sub_admin`
- `expires_at`
- `max_sellers`
- `sub_admin_id`
- `seller_code`
- `price_2_digits_override`
- `price_4_digits_override`
- `use_global_limits`

Archivos que los usan:

- `src/contexts/AuthContext.jsx`
- `src/pages/superadmin/ManageAdmins.jsx`
- `src/pages/superadmin/SuperDashboard.jsx`
- `src/pages/admin/ManageSellers.jsx`
- `src/pages/admin/AdminSales.jsx`

Decision:

- Si estos campos existen en la base real, el repo esta desactualizado.
- Si no existen, hay partes del frontend viviendo de supuestos incorrectos.

### 2.2 `lotteries`

El frontend espera:

- `lottery_type` con valores `regular`, `reventado`, `pale`, `nacional`
- `lottery_modality`
- `billete_prize_1st_multiplier`
- `billete_prize_2nd_multiplier`
- `billete_prize_3rd_multiplier`
- `nat_mult_3match_1`
- `nat_mult_3match_2`
- `nat_mult_3match_3`
- `nat_mult_2first_1`
- `nat_mult_2last_1`
- `nat_mult_2last_2`
- `nat_mult_2last_3`
- `nat_mult_1last_1`

Archivos clave:

- `src/pages/admin/ManageLotteries.jsx`
- `src/pages/admin/ManageResults.jsx`

Decision:

- Si existen, hay que actualizar `database/schema.sql`.
- Si no existen, no debemos tocar loterias nacionales o pale sin rediseñar primero.

### 2.3 `draw_times`

Revisar si existe:

- `admin_id`

La UI lo filtra en:

- `src/pages/admin/ManageLimits.jsx`

Decision:

- Si no existe, ese query del frontend debe corregirse.

### 2.4 `sales_limits`

Revisar si `lottery_id` permite `NULL`.

La UI actual guarda limites globales con `lottery_id = null`.

Decision:

- Si no permite null, la funcionalidad de limites globales no coincide con la BD real.

### 2.5 `winning_numbers`

Revisar si `draw_time_id` permite `NULL`.

La UI actual deja guardar resultados sin sorteo especifico.

Decision:

- Si no permite null, hay que corregir frontend o forzar siempre un sorteo.

### 2.6 `winning_tickets`

Revisar si existe la tabla y estas funciones:

- `generate_winning_tickets`
- `get_winning_tickets`
- `get_winning_tickets_summary`
- `get_seller_winning_tickets`
- `get_subadmin_winning_tickets`

Archivos clave:

- `src/pages/admin/AdminPremios.jsx`
- `src/pages/seller/SellerPremios.jsx`
- `src/pages/admin/ManageResults.jsx`

Decision:

- Si existe todo, la funcionalidad de premios depende de migraciones no reflejadas en el schema base.

## Fase 3: Pruebas funcionales minimas

No hacer cambios antes de probar estos flujos con una cuenta de prueba.

### 3.1 Login

Probar:

1. login de `seller`
2. login de `admin`
3. login de `super_admin`
4. si existe, login de `sub_admin`

Validar:

- redireccion correcta por rol
- restauracion de sesion
- bloqueo por usuario inactivo
- bloqueo por vencimiento si aplica

### 3.2 Venta

Probar:

1. crear ticket normal
2. crear ticket con 2 cifras
3. crear ticket con 4 cifras
4. anular ticket
5. marcar ticket como pagado

Validar:

- insercion en `tickets`
- insercion en `ticket_numbers`
- monto total correcto
- bloqueo por horario correcto

### 3.3 Limites

Probar:

1. limite global
2. limite por loteria
3. limite por sorteo
4. limite por numero

Validar:

- que `useLimits` rechace ventas cuando corresponda
- que `get_admin_daily_sales` devuelva datos coherentes

### 3.4 Resultados y premios

Probar:

1. registrar resultado
2. regenerar ganadores
3. ver panel de premios admin
4. ver premios vendedor

Validar:

- insercion en `winning_numbers`
- generacion correcta en `winning_tickets`
- lectura correcta por RPC

### 3.5 Gestion de usuarios

Probar:

1. crear admin
2. editar admin
3. crear vendedor
4. editar vendedor
5. crear sub-admin si el negocio lo usa

Validar:

- alta en auth
- alta o ajuste correcto en `profiles`
- llamadas RPC funcionales

## Fase 4: Criterio para decidir que tocar

### Caso A: La base real ya tiene todo y funciona

Accion recomendada:

- no tocar la logica de negocio todavia
- actualizar el repo para reflejar la realidad
- corregir `database/schema.sql`
- documentar migraciones faltantes

### Caso B: La base real no tiene todo, pero la app funciona parcialmente

Accion recomendada:

- no ampliar el sistema completo de golpe
- corregir primero los queries inconsistentes
- desactivar o esconder funciones incompletas
- luego migrar por bloques pequenos

### Caso C: La base real tiene una mezcla intermedia

Accion recomendada:

- hacer una matriz de compatibilidad por modulo
- definir que modulos estan “confiables” y cuales “en riesgo”

## Matriz de riesgo actual

- Bajo riesgo:
  - login basico
  - venta simple de tickets
  - consulta basica de ventas

- Riesgo medio:
  - limites
  - horarios especiales
  - configuraciones de moneda

- Riesgo alto:
  - sub-admin
  - admins con expiracion y plan
  - loterias `pale` y `nacional`
  - premios y `winning_tickets`

## Entregable que conviene sacar despues de esta auditoria

Cuando termines las consultas de la Fase 1, conviene armar estos 3 archivos:

1. `schema_real.sql`
   - exportado desde la base real

2. `DIFERENCIAS_FRONTEND_BD.md`
   - lista de campos y RPCs que el frontend usa
   - indicar si existen o no en la base real

3. `PLAN_DE_CORRECCION.md`
   - que se corrige
   - en que orden
   - que no se debe tocar

## Recomendacion final

El siguiente paso seguro no es “arreglar todo”.

El siguiente paso seguro es:

1. sacar el inventario real de la BD
2. comparar contra esta auditoria
3. decidir si vamos a:
   - actualizar el repo a la base real
   - o simplificar el frontend a lo que realmente existe

Si la app ya esta funcionando, lo mas probable es que la prioridad correcta sea:

`alinear el repo con la base real antes de reescribir logica`

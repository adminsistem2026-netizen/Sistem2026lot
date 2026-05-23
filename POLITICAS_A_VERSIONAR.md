# Politicas a Versionar

## Objetivo

Traducir la auditoria de roles a una lista concreta de politicas RLS que conviene rescatar, revisar o reescribir en el repo para que reflejen la base real.

Este documento no cambia produccion.

Sirve para:

1. saber que tablas dependen de reglas reales no versionadas
2. priorizar que politicas rescatar primero
3. evitar tocar permisos a ciegas

## Prioridad de rescate

### Prioridad 1

Politicas que impactan directamente al vendedor movil y a la regla critica de alcance:

- `tickets`
- `ticket_numbers`
- `sales_limits`
- `lotteries`
- `draw_times`
- `winning_tickets`

### Prioridad 2

Politicas del alcance admin y sub-admin:

- `profiles`
- `settlements`
- RPCs con `SECURITY DEFINER` que agregan ventas, premios o balances

### Prioridad 3

Politicas mas globales o de menor riesgo inmediato:

- `system_config`
- `winning_numbers`

## Tabla por tabla

## 1. `tickets`

### Politica actual en repo

`database/schema.sql`:

- `tickets_select`
- `tickets_insert`
- `tickets_update`

### Lo que resuelve bien

- `seller` puede leer sus tickets
- `admin` puede leer tickets de su red via `admin_id`
- `super_admin` tiene acceso global

### Brecha o riesgo

- `sub_admin` no aparece explicitamente
- `seller` puede hacer `UPDATE` sobre tickets propios, pero el repo no acota por columnas

### Lo que conviene rescatar de produccion

- si existe politica especial para `sub_admin`
- si hay restricciones adicionales para que un `seller` solo pueda:
  - anular su ticket
  - marcarlo como cobrado
- si el update sensible esta protegido por trigger o RPC y no solo por RLS

### Prioridad

- muy alta

## 2. `ticket_numbers`

### Politica actual en repo

`database/schema.sql`:

- `ticket_numbers_select`
- `ticket_numbers_insert`

### Lo que resuelve bien

- hereda alcance desde `tickets`
- vendedor solo inserta numeros para tickets propios

### Brecha o riesgo

- no hay politica de `UPDATE`, lo cual puede ser correcto
- depende totalmente de que `tickets` este bien protegido

### Lo que conviene rescatar de produccion

- confirmar que no exista update inesperado
- confirmar que lectura admin/sub-admin siga el mismo alcance que tickets

### Prioridad

- alta

## 3. `sales_limits`

### Politica actual en repo

`database/schema.sql`:

- `sales_limits_all`

Con esta regla, solo:

- `admin`
- `super_admin`

podrian leer o escribir.

### Brecha o riesgo

El vendedor usa `sales_limits` desde `src/hooks/useLimits.js`.

Si el repo fuera fiel a produccion, la app movil no podria validar limites.

### Lo que conviene rescatar de produccion

- politica de lectura para `seller`
- si `seller` ve:
  - todos los limites del admin
  - o solo los de su loteria/sorteo
- confirmar que `seller` no pueda insertar, borrar o cambiar limites

### Prioridad

- critica

## 4. `lotteries`

### Politica actual en repo

`database/schema.sql`:

- `lotteries_select`
- `lotteries_insert`
- `lotteries_update`

### Lo que resuelve bien

- `seller` puede leer loterias del admin padre por relacion en `profiles.parent_admin_id`
- `admin` y `super_admin` tienen alcance razonable

### Brecha o riesgo

- `sub_admin` no queda explicitamente documentado
- la regla mezcla loterias globales (`admin_id IS NULL`) y loterias por admin

### Lo que conviene rescatar de produccion

- regla exacta para `sub_admin`
- confirmar si un `seller` puede ver solo loterias activas o eso se resuelve solo en frontend

### Prioridad

- muy alta

## 5. `draw_times`

### Politica actual en repo

`database/schema.sql`:

- `draw_times_select`
- `draw_times_insert`
- `draw_times_update`

### Lo que resuelve bien

- el acceso se hereda desde `lotteries`

### Brecha o riesgo

- el repo ya estaba desalineado en consultas como `draw_times.admin_id`
- conviene asegurarse de que la politica real siga colgando de `lotteries.admin_id`

### Lo que conviene rescatar de produccion

- si `seller` puede leer horarios por pertenecer al admin padre
- si `sub_admin` tiene lectura igual que seller/admin

### Prioridad

- muy alta

## 6. `winning_tickets`

### Politica actual en repo

`database/winning_tickets_migration.sql`:

- `winning_tickets_admin_select`

`database/fix_winning_tickets_rls.sql`:

- `winning_tickets_seller_update`

### Lo que resuelve bien

- `admin` y `seller` pueden leer premios propios
- `seller` puede actualizar premios propios

### Brecha o riesgo

- `sub_admin` no aparece
- el `UPDATE` del seller podria ser demasiado amplio si no esta acotado por columnas o flujo

### Lo que conviene rescatar de produccion

- si `sub_admin` puede leer premios de su red
- si el seller solo puede cambiar `is_paid` y campos relacionados
- si admin tambien tiene update operativo sobre premios

### Prioridad

- critica

## 7. `profiles`

### Politica actual en repo

`database/schema.sql`:

- `profiles_select`
- `profiles_insert`
- `profiles_update`

### Lo que resuelve bien

- usuario ve su propio perfil
- admin ve perfiles de su red
- super-admin ve todo

### Brecha o riesgo

- `sub_admin_id` existe en modelo, pero el alcance fino no esta del todo claro en RLS
- `sub_admin` no aparece con contrato claro

### Lo que conviene rescatar de produccion

- si `sub_admin` puede ver solo sus vendedores
- si hay restricciones para que admin no modifique campos delicados fuera de sus funciones

### Prioridad

- alta

## 8. `settlements`

### Politica actual en repo

`database/balance_settlements_migration.sql`:

- `settlements_select`
- `settlements_insert`

### Lo que resuelve bien

- admin ve sus liquidaciones
- seller ve sus propias liquidaciones

### Brecha o riesgo

- `sub_admin` no aparece
- no sabemos si produccion necesita lectura agregada por sub-admin

### Lo que conviene rescatar de produccion

- si existe politica adicional para `sub_admin`
- si hay alguna regla de update/delete operativa no versionada

### Prioridad

- media-alta

## 9. `winning_numbers`

### Politica actual en repo

`database/schema.sql`:

- `winning_numbers_select`
- `winning_numbers_insert`

### Lo que resuelve bien

- lectura abierta para consumo operativo
- insercion reservada a admin/super-admin

### Brecha o riesgo

- no aparece politica de `UPDATE`
- conviene confirmar si el sistema corrige resultados por update, delete o reinsercion

### Prioridad

- media

## 10. `system_config`

### Politica actual en repo

`database/schema.sql`:

- `system_config_select`
- `system_config_update`

### Lo que resuelve bien

- todos leen
- solo `super_admin` actualiza

### Brecha o riesgo

- baja, salvo que existan claves sensibles mezcladas ahi

### Prioridad

- baja

## RPCs que tambien hay que revisar por seguridad

Aunque no son tablas RLS, estas funciones pueden saltarse parte del modelo si son `SECURITY DEFINER` o si agregan datos de varios usuarios:

- `get_admin_daily_sales`
- `get_numbers_for_admin`
- `get_winning_tickets`
- `get_winning_tickets_summary`
- `get_seller_balance`
- `get_seller_balance_detail`
- `get_all_sellers_balance`
- `setup_new_user`
- `delete_seller`
- `delete_admin_cascade`

## Orden recomendado para versionar politicas

1. `sales_limits`
2. `tickets`
3. `ticket_numbers`
4. `winning_tickets`
5. `lotteries`
6. `draw_times`
7. `profiles`
8. `settlements`
9. `winning_numbers`
10. `system_config`

## Siguiente paso practico

Cuando toque rescatar desde la base real, la salida ideal es una migracion o carpeta SQL con:

- `DROP POLICY IF EXISTS ...`
- `CREATE POLICY ...`
- una nota por tabla explicando que rol cubre

Eso permitiria que el repo deje de depender de memoria o de la base productiva como unica fuente de verdad.

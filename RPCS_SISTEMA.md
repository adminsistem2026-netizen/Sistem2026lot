# RPCs del Sistema

## Objetivo

Documentar las funciones RPC que la aplicacion usa hoy para:

1. entender dependencias criticas
2. evitar romper modulos funcionales
3. identificar que RPCs ya estan versionadas en `database/`
4. identificar que RPCs existen en produccion pero no estan documentadas en el repo

## Lectura rapida

Hay dos grupos principales:

### 1. RPCs documentadas en SQL local

Estas si aparecen en `database/` y tienen una base mas confiable para mantenimiento.

### 2. RPCs usadas por el frontend pero no encontradas en SQL local

Estas son las mas delicadas.
Si existen en la base real pero no en el repo, el proyecto depende de logica productiva no versionada aqui.

## Frontera importante: frontend activo vs modulo legado

El frontend activo de la aplicacion entra por:

- `src/main.jsx`
- `src/App.jsx`

Eso significa que las RPC usadas por pantallas dentro de `src/pages`, `src/hooks` y `src/contexts` tienen prioridad mas alta.

En cambio, muchas RPC encontradas solo en `src/app.js` deben tratarse como:

- modulo legado
- posible referencia historica
- no prioridad inmediata, salvo que el negocio confirme que aun se usa

## RPCs usadas por el frontend actual

### Autenticacion y perfiles

- `get_profile_codes`
  - uso:
    - `src/contexts/AuthContext.jsx`
    - `src/app.js`
  - estado en repo SQL:
    - no encontrada en `database/`
  - riesgo:
    - medio
  - nota:
    - importante para `seller_code`

- `setup_new_user`
  - uso:
    - `src/pages/admin/ManageSellers.jsx`
    - `src/pages/superadmin/ManageAdmins.jsx`
  - estado en repo SQL:
    - no encontrada
  - riesgo:
    - alto
  - nota:
    - clave para alta correcta de perfiles

- `update_admin_profile`
  - uso:
    - `src/pages/superadmin/ManageAdmins.jsx`
  - estado en repo SQL:
    - no encontrada
  - riesgo:
    - medio-alto

- `change_user_password`
  - uso:
    - `src/pages/admin/ManageSellers.jsx`
    - `src/pages/superadmin/ManageAdmins.jsx`
    - `src/app.js`
  - estado en repo SQL:
    - no encontrada
  - riesgo:
    - alto

- `delete_admin_cascade`
  - uso:
    - `src/pages/superadmin/ManageAdmins.jsx`
  - estado en repo SQL:
    - no encontrada
  - riesgo:
    - alto

- `delete_seller`
  - uso:
    - `src/pages/admin/ManageSellers.jsx`
  - estado en repo SQL:
    - no encontrada
  - riesgo:
    - alto

### Limites y ventas agregadas

- `get_admin_daily_sales`
  - uso:
    - `src/hooks/useLimits.js`
    - `src/app.js`
  - estado en repo SQL:
    - no encontrada
  - riesgo:
    - alto
  - nota:
    - critica para no vender de mas

### Loterias y configuracion

- `get_lottery_billete_multipliers`
  - uso:
    - `src/pages/admin/ManageLotteries.jsx`
    - `src/pages/admin/AdminNumbers.jsx`
    - `src/app.js`
  - estado en repo SQL:
    - no encontrada
  - riesgo:
    - medio-alto

- `update_lottery_multipliers`
  - uso:
    - `src/pages/admin/ManageLotteries.jsx`
  - estado en repo SQL:
    - no encontrada
  - riesgo:
    - medio-alto

- `update_lottery_prices`
  - uso:
    - `src/pages/admin/ManageLotteries.jsx`
  - estado en repo SQL:
    - no encontrada
  - riesgo:
    - medio-alto

- `update_national_config`
  - uso:
    - `src/pages/admin/ManageLotteries.jsx`
  - estado en repo SQL:
    - no encontrada
  - riesgo:
    - alto

- `deactivate_lottery`
  - uso:
    - `src/pages/admin/ManageLotteries.jsx`
  - estado en repo SQL:
    - no encontrada
  - riesgo:
    - medio

- `reactivate_lottery`
  - uso:
    - `src/pages/admin/ManageLotteries.jsx`
  - estado en repo SQL:
    - no encontrada
  - riesgo:
    - medio

### Premios y tickets ganadores

- `generate_winning_tickets`
  - uso:
    - `src/pages/admin/ManageResults.jsx`
    - `src/pages/admin/AdminPremios.jsx`
  - estado en repo SQL:
    - documentada en `database/winning_tickets_migration.sql`
  - riesgo:
    - medio

- `get_winning_tickets`
  - uso:
    - `src/pages/admin/AdminPremios.jsx`
  - estado en repo SQL:
    - documentada en `database/winning_tickets_migration.sql`
    - ajustada luego en `database/fix_is_paid_from_tickets.sql`
  - riesgo:
    - medio

- `get_winning_tickets_summary`
  - uso:
    - `src/pages/admin/AdminPremios.jsx`
  - estado en repo SQL:
    - documentada en `database/winning_tickets_migration.sql`
    - ajustada luego en `database/fix_is_paid_from_tickets.sql`
  - riesgo:
    - medio

- `get_seller_winning_tickets`
  - uso:
    - `src/pages/seller/SellerPremios.jsx`
    - `src/app.js`
  - estado en repo SQL:
    - documentada en `database/winning_tickets_migration.sql`
    - ajustada luego en `database/fix_is_paid_from_tickets.sql`
  - riesgo:
    - medio

- `get_subadmin_winning_tickets`
  - uso:
    - `src/app.js`
  - estado en repo SQL:
    - documentada en `database/winning_tickets_migration.sql`
    - ajustada luego en `database/fix_is_paid_from_tickets.sql`
  - riesgo:
    - medio

- `pay_winning_ticket`
  - uso actual visible:
    - no encontrado en `src/` nuevo
  - estado en repo SQL:
    - documentada en `database/winning_tickets_migration.sql`
  - riesgo:
    - bajo

### Balance y liquidaciones

- `get_seller_balance`
  - uso:
    - `src/pages/admin/AdminBalance.jsx`
  - estado en repo SQL:
    - documentada en `database/balance_settlements_migration.sql`
  - riesgo:
    - medio

- `get_seller_balance_detail`
  - uso:
    - `src/pages/admin/AdminBalance.jsx`
  - estado en repo SQL:
    - documentada
  - riesgo:
    - medio

- `get_all_sellers_balance`
  - uso:
    - `src/pages/admin/AdminBalance.jsx`
  - estado en repo SQL:
    - documentada
  - riesgo:
    - medio

- `create_settlement`
  - uso:
    - `src/pages/admin/AdminBalance.jsx`
  - estado en repo SQL:
    - documentada
  - riesgo:
    - medio

- `get_settlements_history`
  - uso:
    - `src/pages/admin/AdminBalance.jsx`
    - `src/app.js`
  - estado en repo SQL:
    - documentada
  - riesgo:
    - medio

- `get_seller_balance_for_seller`
  - uso:
    - `src/app.js`
  - estado en repo SQL:
    - documentada
  - riesgo:
    - medio

- `get_seller_balance_detail_for_seller`
  - uso:
    - `src/app.js`
  - estado en repo SQL:
    - documentada
  - riesgo:
    - medio

### RPCs de modulo legado en `src/app.js`

Estas aparecen en el archivo legado grande y deben tratarse con cuidado adicional:

- `save_ticket`
- `create_seller_for_subadmin`
- `delete_seller_subadmin`
- `get_subadmin_sales`
- `get_subadmin_numbers`
- `get_subadmin_sellers`
- `get_numbers_for_admin`

Estado en repo SQL:

- no encontradas en los SQL revisados

Riesgo:

- alto

## Clasificacion de confianza

### Alta confianza

RPCs con definicion local clara:

- `generate_winning_tickets`
- `get_winning_tickets`
- `get_winning_tickets_summary`
- `get_seller_winning_tickets`
- `get_subadmin_winning_tickets`
- `get_seller_balance`
- `get_seller_balance_detail`
- `get_all_sellers_balance`
- `create_settlement`
- `get_settlements_history`
- `get_seller_balance_for_seller`
- `get_seller_balance_detail_for_seller`

### Confianza media

RPCs usadas por frontend moderno pero sin definicion local aun:

- `get_lottery_billete_multipliers`
- `update_lottery_multipliers`
- `update_lottery_prices`
- `deactivate_lottery`
- `reactivate_lottery`

### Confianza baja

RPCs criticas usadas por la app pero no documentadas en el repo:

- `setup_new_user`
- `change_user_password`
- `delete_admin_cascade`
- `delete_seller`
- `get_admin_daily_sales`
- `get_profile_codes`
- `update_admin_profile`
- `update_national_config`
- todas las RPCs heredadas de `src/app.js` listadas arriba

## Prioridad real de rescate al repo

### Prioridad 1: criticas del frontend activo

Estas afectan directamente la aplicacion actual y no estan versionadas en SQL local:

- `setup_new_user`
- `change_user_password`
- `get_admin_daily_sales`
- `get_profile_codes`
- `update_admin_profile`
- `delete_seller`
- `delete_admin_cascade`
- `get_lottery_billete_multipliers`
- `update_lottery_multipliers`
- `update_lottery_prices`
- `update_national_config`
- `deactivate_lottery`
- `reactivate_lottery`

### Prioridad 2: confirmar antes de tocar

Estas viven en el modulo legado `src/app.js` y no deben mezclarse con el frontend actual sin confirmar uso real:

- `save_ticket`
- `get_subadmin_sellers`
- `create_seller_for_subadmin`
- `delete_seller_subadmin`
- `get_subadmin_sales`
- `get_subadmin_numbers`
- `get_numbers_for_admin`

## Recomendacion operativa inmediata

El siguiente trabajo recomendable ya no es buscar mas pantallas, sino:

1. rescatar primero las RPC de Prioridad 1
2. documentar su firma y comportamiento esperado
3. no modificar ni reescribir las RPC del modulo legado hasta confirmar que siguen en uso

## Recomendacion operativa

Prioridad de trabajo:

1. no reescribir RPCs documentadas y funcionales si no hay bug confirmado
2. versionar en SQL local las RPCs criticas no documentadas
3. separar las RPCs del modulo legado `src/app.js`
4. dejar trazabilidad de que pantallas dependen de cada funcion

## Proximo entregable recomendado

Crear una migracion o carpeta de documentacion para RPCs faltantes con:

- nombre
- firma
- quien la usa
- si existe en produccion
- si ya fue exportada al repo

## Documentacion detallada disponible

- `RPCS_CRITICAS_BLOQUE_1.md`
  - `get_profile_codes`
  - `get_admin_daily_sales`
- `RPCS_CRITICAS_BLOQUE_2.md`
  - `setup_new_user`
  - `change_user_password`
- `RPCS_CRITICAS_BLOQUE_3.md`
  - `update_admin_profile`
  - `delete_seller`
  - `delete_admin_cascade`
- `RPCS_CRITICAS_BLOQUE_4.md`
  - `get_lottery_billete_multipliers`
  - `update_lottery_multipliers`
  - `update_lottery_prices`
  - `update_national_config`
  - `deactivate_lottery`
  - `reactivate_lottery`
  - nota operativa sobre `get_numbers_for_admin`

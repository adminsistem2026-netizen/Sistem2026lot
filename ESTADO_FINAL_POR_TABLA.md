# Estado Final por Tabla

## Objetivo

Dejar un tablero simple para la siguiente fase:

- comparar produccion contra repo
- comparar produccion contra candidatos
- decidir por tabla si se versiona, se ajusta o no se toca todavia

Este archivo esta preparado para llenarse cuando tengamos la evidencia final de produccion por tabla.

## Estados posibles

- `coincide con produccion`
- `ajustar antes de versionar`
- `no tocar aun`
- `pendiente de confirmar`

## Prioridad 1

## `sales_limits`

- estado actual: `pendiente de confirmar`
- repo actual:
  - no deja leer al vendedor
- candidato:
  - si deja leer a la red del admin
- revisar en produccion:
  - si vendedor lee directo por RLS
  - si sub-admin lee
  - si lectura debe ser total o parcial
- decision final:
  - pendiente
- nota:
  - critica para que la app movil valide limites

## `tickets`

- estado actual: `pendiente de confirmar`
- repo actual:
  - no expresa bien `sub_admin`
  - seller puede actualizar tickets propios sin limite por columnas
- candidato:
  - alcance por red mejor definido
  - insert valida `admin_id` coherente
- revisar en produccion:
  - si hay trigger o RPC para endurecer updates
  - si `sub_admin` ve su red
- decision final:
  - pendiente
- nota:
  - critica para la regla de que vendedor solo vea lo suyo

## `winning_tickets`

- estado actual: `pendiente de confirmar`
- repo actual:
  - admin y seller si
  - sub-admin no claro
- candidato:
  - agrega sub-admin y refuerza alcance
- revisar en produccion:
  - si seller puede solo marcar pagos
  - si admin puede actualizar
  - si sub-admin participa
- decision final:
  - pendiente
- nota:
  - critica por premios y pagos

## `profiles`

- estado actual: `pendiente de confirmar`
- repo actual:
  - admin y super-admin claros
  - sub-admin incompleto
- candidato:
  - contempla vendedores asignados por `sub_admin_id`
- revisar en produccion:
  - alcance real de sub-admin
  - si admin puede editar todos los campos o no
- decision final:
  - pendiente
- nota:
  - critica por alcance de red y administracion

## Prioridad 2

## `ticket_numbers`

- estado actual: `pendiente de confirmar`
- repo actual:
  - hereda desde tickets
- candidato:
  - mismo alcance que tickets
- revisar en produccion:
  - si hay updates ocultos
  - si sub-admin participa
- decision final:
  - pendiente

## `lotteries`

- estado actual: `pendiente de confirmar`
- repo actual:
  - lectura por admin padre y loterias globales
- candidato:
  - formaliza mejor seller/sub-admin/admin
- revisar en produccion:
  - si sub-admin comparte la misma lectura
  - si activas/inactivas se controlan solo por frontend o tambien por RLS
- decision final:
  - pendiente

## `draw_times`

- estado actual: `pendiente de confirmar`
- repo actual:
  - hereda desde loterias
- candidato:
  - se alinea con el modelo real sin `draw_times.admin_id`
- revisar en produccion:
  - si realmente cuelga de `lotteries.admin_id`
- decision final:
  - pendiente

## `settlements`

- estado actual: `pendiente de confirmar`
- repo actual:
  - admin y seller
- candidato:
  - agrega lectura por sub-admin
- revisar en produccion:
  - si sub-admin participa en balances
  - si hay updates/deletes
- decision final:
  - pendiente

## Prioridad 3

## `winning_numbers`

- estado actual: `pendiente de confirmar`
- repo actual:
  - select abierto
  - insert admin/super-admin
- candidato:
  - agrega delete para flujo real de `ManageResults`
- revisar en produccion:
  - si usan delete+insert o update
- decision final:
  - pendiente

## `system_config`

- estado actual: `pendiente de confirmar`
- repo actual:
  - select abierto
  - update super-admin
- candidato:
  - agrega insert/delete super-admin
- revisar en produccion:
  - si realmente hace falta insert/delete
- decision final:
  - pendiente

## Regla central a proteger en toda decision

- el vendedor en movil solo debe ver sus propias ventas y sus propios premios

## Orden sugerido para llenar este tablero

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

## Resultado esperado al completar este archivo

Tener cada tabla clasificada como:

- lista para versionar
- necesita ajuste
- o mejor no tocarla todavia

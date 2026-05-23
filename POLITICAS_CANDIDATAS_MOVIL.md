# Politicas Candidatas Movil

## Objetivo

Dejar documentado el primer archivo SQL candidato para alinear permisos criticos de la app movil sin tocar produccion.

Archivo:

- `database/rls_candidate_mobile_scope.sql`

## Que cubre

- `sales_limits`
- `tickets`
- `ticket_numbers`

## Por que este bloque va primero

Porque es el bloque que protege la regla mas importante que ya aclaraste:

- el vendedor solo debe ver sus propias ventas

Y ademas sostiene el flujo de validacion de limites antes de vender.

## Que asume el candidato

### `sales_limits`

- el vendedor si debe poder leer limites del admin asociado
- el vendedor no debe poder insertar, editar ni borrar limites

### `tickets`

- el vendedor solo lee sus tickets
- el admin lee los de su red
- `sub_admin` puede leer su propio alcance si ese rol sigue en uso
- el vendedor solo puede insertar tickets con su propio `seller_id`
- el `admin_id` del ticket debe coincidir con el admin padre del usuario autenticado

### `ticket_numbers`

- hereda el alcance desde `tickets`
- solo el vendedor duenio del ticket puede insertar sus lineas

## Lo que todavia NO resuelve por si solo

RLS sola no impide que un vendedor actualice columnas equivocadas dentro de un ticket propio.

Eso significa que, aunque el candidato mejora el alcance por fila, todavia conviene decidir luego una de estas dos opciones:

1. agregar trigger que limite columnas editables
2. mover anular/cobrar ticket a RPCs especificas

## Estado recomendado

Este archivo debe tratarse como:

- candidato de versionado
- no como reflejo confirmado de produccion

## Siguiente paso

Si seguimos en este orden, el bloque natural despues de este es:

- `winning_tickets`
- `lotteries`
- `draw_times`

Porque completan el alcance operativo del vendedor y del admin.

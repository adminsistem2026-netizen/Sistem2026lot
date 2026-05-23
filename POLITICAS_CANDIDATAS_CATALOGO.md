# Politicas Candidatas Catalogo

## Objetivo

Documentar el segundo archivo SQL candidato para permisos de:

- `winning_tickets`
- `lotteries`
- `draw_times`

Archivo:

- `database/rls_candidate_catalog_scope.sql`

## Que cubre

### `winning_tickets`

- vendedor ve solo sus premios
- admin ve premios de su red
- `sub_admin` queda contemplado para su red
- `super_admin` mantiene acceso global

### `lotteries`

- vendedor y sub-admin leen loterias del admin padre
- admin edita solo las suyas
- loterias globales siguen visibles

### `draw_times`

- hereda acceso desde la loteria
- admin y super-admin mantienen escritura

## Punto delicado

`winning_tickets` tiene el mismo matiz de `tickets`:

- RLS define alcance por fila
- no define por si sola que columnas exactas puede cambiar el usuario

Por eso este archivo debe leerse como candidato de alcance, no como cierre total del problema de pagos.

## Relacion con la app actual

Este bloque acompana lo que hoy ya hace el frontend:

- `useLotteries.js` carga loterias y horarios para vendedor segun admin padre
- `SellerPremios.jsx` consulta premios propios por RPC
- `AdminPremios.jsx` opera premios del admin

## Siguiente paso

Despues de estos dos candidatos, lo mas sensato es:

1. revisar `profiles` y `settlements`
2. luego decidir si conviene reconstruir triggers o RPCs para updates sensibles

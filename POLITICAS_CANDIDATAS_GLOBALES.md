# Politicas Candidatas Globales

## Objetivo

Documentar el bloque final de politicas candidatas para:

- `winning_numbers`
- `system_config`

Archivo:

- `database/rls_candidate_global_scope.sql`

## Que cubre

### `winning_numbers`

- lectura abierta para la app
- insercion reservada al admin duenio de la loteria o `super_admin`
- borrado contemplado porque `ManageResults.jsx` hoy guarda resultados con delete + insert

### `system_config`

- lectura abierta
- escritura reservada a `super_admin`

## Relacion con la app actual

Este bloque acompana estos flujos:

- `ManageResults.jsx` guarda y recalcula resultados/premios
- `GlobalConfig.jsx` mantiene monedas y configuracion global

## Estado del paquete candidato

Con este archivo ya queda completo el paquete de politicas candidatas del repo para las tablas principales:

- `sales_limits`
- `tickets`
- `ticket_numbers`
- `winning_tickets`
- `lotteries`
- `draw_times`
- `profiles`
- `settlements`
- `winning_numbers`
- `system_config`

## Lo siguiente

Ya no falta mapa general.

Lo que queda despues es elegir entre dos caminos:

1. rescatar las politicas reales desde produccion y compararlas contra estos candidatos
2. o endurecer primero los updates sensibles con triggers / RPCs antes de tocar RLS real

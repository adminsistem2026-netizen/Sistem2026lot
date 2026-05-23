# Hoja de Ruta Tecnica

## Objetivo

Ordenar el trabajo de estabilizacion y documentacion del sistema sin romper lo que ya funciona en produccion.

## Principio rector

No tocar primero lo que es mas riesgoso.

El orden correcto es:

1. entender
2. documentar
3. alinear repo con realidad
4. corregir desajustes seguros
5. auditar seguridad y permisos
6. solo despues considerar refactors grandes

## Estado actual

### Ya confirmado

- la app funciona en produccion
- la base real esta mas avanzada que `database/schema.sql`
- `ManageLimits` tenia un desajuste real y ya fue corregido
- el APK con ese arreglo fue probado y funciona

### Ya documentado

- `AUDITORIA_SISTEMA.md`
- `RPCS_SISTEMA.md`
- `RPCS_CRITICAS_BLOQUE_1.md`
- `RPCS_CRITICAS_BLOQUE_2.md`
- `RPCS_CRITICAS_BLOQUE_3.md`
- `RPCS_CRITICAS_BLOQUE_4.md`
- `AUDITORIA_RLS_ROLES.md`
- `POLITICAS_A_VERSIONAR.md`
- `POLITICAS_CANDIDATAS_MOVIL.md`
- `POLITICAS_CANDIDATAS_CATALOGO.md`
- `POLITICAS_CANDIDATAS_SOPORTE.md`
- `POLITICAS_CANDIDATAS_GLOBALES.md`
- `MATRIZ_FINAL_RLS.md`
- `ESTADO_FINAL_POR_TABLA.md`
- `PAQUETE_VERIFICACION_PRODUCCION.md`

### Ya alineado parcialmente

- `database/schema.sql`
  - actualizado en estructura principal para acercarlo a la base real

## Fases de trabajo

### Fase 1. Documentacion critica

Objetivo:

- dejar trazabilidad de lo que el sistema usa hoy

Incluye:

- auditoria general
- mapa de RPCs
- contratos funcionales de RPCs criticas

Estado:

- en progreso

### Fase 2. Rescate de RPCs del frontend activo

Objetivo:

- identificar y documentar primero las RPC que sostienen el frontend actual

Orden recomendado:

1. `get_profile_codes`
2. `get_admin_daily_sales`
3. `setup_new_user`
4. `change_user_password`
5. `update_admin_profile`
6. `delete_seller`
7. `delete_admin_cascade`
8. `get_lottery_billete_multipliers`
9. `update_lottery_multipliers`
10. `update_lottery_prices`
11. `update_national_config`
12. `deactivate_lottery`
13. `reactivate_lottery`

Estado:

- en progreso

### Fase 3. Auditoria de permisos y RLS

Objetivo:

- confirmar que cada rol solo puede ver y tocar lo que le corresponde

Reglas criticas:

- `seller` solo ve sus ventas y sus premios
- `admin` solo ve su red
- `sub_admin` solo ve su alcance
- `super_admin` gestiona administradores y configuracion global

Estado:

- documentada y lista para versionado posterior

### Fase 4. Separacion entre frontend activo y modulo legado

Objetivo:

- no mezclar `src/App.jsx` con `src/app.js`

Acciones:

- documentar que RPCs son del sistema actual
- documentar que RPCs son solo del modulo legado
- no tocar RPCs legadas salvo confirmacion de uso real

Estado:

- parcialmente identificado

### Fase 5. Consolidacion del repo

Objetivo:

- que el repo refleje de verdad como funciona el sistema

Incluye:

- schema principal alineado
- migraciones separadas claras
- documentacion de RPCs
- checklist de pruebas

Estado:

- en progreso

## Criterio de seguridad para cada paso

Antes de hacer cambios funcionales:

1. si el cambio solo documenta, se puede hacer
2. si el cambio corrige un desajuste confirmado y acotado, se puede hacer
3. si el cambio toca permisos, ventas o usuarios, primero se documenta y luego se valida
4. si el cambio depende de una RPC no versionada, no se reescribe sin especificacion

## Orden de ejecucion practico

### Paso 1

Completar documentacion de RPCs criticas de usuarios.

### Paso 2

Completar documentacion de RPCs criticas de administracion.

### Paso 3

Completar documentacion de RPCs de loterias y configuracion.

Estado actual:

- completado

### Paso 4

Preparar checklist de auditoria RLS por rol.

Estado actual:

- completado

### Paso 5

Decidir si conviene:

- exportar RPCs desde produccion al repo
- o reconstruirlas desde comportamiento observado

### Paso 6

Preparar lista concreta de politicas RLS a rescatar o alinear.

Estado actual:

- completado

### Paso 7

Preparar SQL candidato para el bloque critico de la app movil.

Estado actual:

- completado para `sales_limits`, `tickets` y `ticket_numbers`

### Paso 8

Preparar SQL candidato para catalogo y premios.

Estado actual:

- completado para `winning_tickets`, `lotteries` y `draw_times`

### Paso 9

Preparar SQL candidato para perfiles y liquidaciones.

Estado actual:

- completado para `profiles` y `settlements`

### Paso 10

Preparar SQL candidato para resultados y configuracion global.

Estado actual:

- completado para `winning_numbers` y `system_config`

## Estado de esta etapa

La fase documental de politicas candidatas queda completa.

### Paso 11

Preparar matriz final para comparar repo, candidatos y produccion.

Estado actual:

- completado

### Paso 12

Preparar tablero final de estado por tabla para la fase de contraste con produccion.

Estado actual:

- completado

### Paso 13

Preparar paquete exacto de verificaciones para contrastar produccion.

Estado actual:

- completado

## Que no hacer todavia

- no rehacer `src/app.js`
- no cambiar flujos de venta de vendedores
- no tocar RLS a ciegas
- no reescribir RPCs que ya funcionan en produccion sin contrato previo

## Meta final

Llegar a un repo donde:

- el schema principal no este atrasado
- las RPC criticas esten identificadas
- los permisos por rol esten claros
- el mantenimiento futuro no dependa de adivinar como esta hecha la base real

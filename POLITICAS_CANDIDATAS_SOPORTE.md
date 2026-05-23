# Politicas Candidatas Soporte

## Objetivo

Documentar el tercer archivo SQL candidato para:

- `profiles`
- `settlements`

Archivo:

- `database/rls_candidate_support_scope.sql`

## Que cubre

### `profiles`

- cada usuario ve su propio perfil
- admin ve perfiles de su red
- `sub_admin` queda contemplado para vendedores asignados
- `super_admin` mantiene visibilidad global

### `settlements`

- seller ve solo sus cortes
- admin ve los de su red
- `sub_admin` queda contemplado para lectura de vendedores asignados
- `super_admin` puede auditar

## Punto delicado

Este bloque mejora mucho la trazabilidad del alcance, pero no cierra por completo la seguridad de edicion.

El caso mas sensible sigue siendo `profiles`:

- un admin hoy hace updates directos desde varias pantallas
- despues conviene decidir si eso se mantiene
- o si se mueve mas logica a RPCs controladas

## Relacion con la app actual

Este candidato se apoya en lo que hoy hace el frontend:

- `ManageSellers.jsx` carga y edita perfiles de la red del admin
- `ManageAdmins.jsx` trabaja sobre admins desde `super_admin`
- `AdminBalance.jsx` consulta balances y liquidaciones

## Estado del mapa RLS

Con este bloque ya queda cubierto en candidatos casi todo el alcance principal del sistema:

- ventas
- limites
- loterias
- horarios
- premios
- perfiles
- liquidaciones

## Lo que quedaria pendiente despues

1. revisar si conviene hacer candidatos tambien para:
   - `winning_numbers`
   - `system_config`
2. decidir si los updates sensibles deben quedarse en RLS directa o pasar a RPCs / triggers

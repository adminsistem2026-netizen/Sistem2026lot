# RPCs Criticas - Bloque 3

## Objetivo

Documentar el bloque de administracion de usuarios que completa el ciclo de vida:

- `update_admin_profile`
- `delete_seller`
- `delete_admin_cascade`

Estas RPCs son delicadas porque cambian o destruyen datos estructurales del sistema.

## 1. `update_admin_profile`

### Donde se usa

Frontend activo:

- `src/pages/superadmin/ManageAdmins.jsx`

### Parametros observados

```sql
p_id UUID,
p_full_name TEXT,
p_phone TEXT,
p_expires_at TIMESTAMPTZ,
p_max_sellers INTEGER
```

### Efecto esperado

Debe actualizar en `profiles` del admin objetivo:

- nombre
- telefono
- fecha de vencimiento
- limite de vendedores

### Cosas que NO deberia tocar

- email
- password
- rol
- relaciones con vendedores
- estado de activacion, salvo que explicitamente se diseñe asi

### Regla de seguridad

Debe estar reservada a `super_admin`.

### Riesgo si se rompe

- planes mal configurados
- admins vencidos sin control
- limites de vendedores inconsistentes

### Criticidad

- funcional: alta
- operativa: alta
- seguridad: alta

## 2. `delete_seller`

### Donde se usa

Frontend activo:

- `src/pages/admin/ManageSellers.jsx`

Modulo legado relacionado:

- `src/app.js` usa otra RPC distinta para sub-admin (`delete_seller_subadmin`)

### Parametros observados

```sql
p_seller_id UUID
```

### Efecto esperado

Debe eliminar de forma segura a un vendedor o sub-admin dentro del alcance del admin.

Por el texto de la UI, se espera que elimine:

- perfil y acceso
- tickets
- numeros vendidos

Y si hay mas datos dependientes, tambien deberia considerar:

- premios asociados
- relaciones internas si es `sub_admin`

### Regla de seguridad

Debe validar al menos:

- que el vendedor pertenece al admin autenticado
- que no se pueda eliminar un usuario fuera de su red

### Caso especial: `sub_admin`

La UI ya bloquea eliminar un sub-admin si aun tiene vendedores asignados.

Referencia:

- `src/pages/admin/ManageSellers.jsx`

Eso sugiere que la RPC puede asumir parte de esa validacion desde frontend, pero idealmente tambien deberia validar del lado servidor.

### Riesgo si se rompe

- borrado cruzado de vendedores de otro admin
- residuos de datos en tickets o premios
- cuentas auth huerfanas

### Criticidad

- funcional: alta
- operativa: alta
- seguridad: muy alta

## 3. `delete_admin_cascade`

### Donde se usa

Frontend activo:

- `src/pages/superadmin/ManageAdmins.jsx`

### Parametros observados

```sql
p_admin_id UUID
```

### Efecto esperado

Debe eliminar de forma cascada un admin y todo su universo operativo.

La UI declara explicitamente que deberia eliminar:

- vendedores
- loterias
- horarios
- ventas
- registros relacionados

En la practica, tambien podria implicar:

- premios
- limites
- balances
- liquidaciones
- relaciones con sub-admins
- accesos auth

### Regla de seguridad

Debe estar reservada a `super_admin`.

No debe ser invocable por `admin`, `sub_admin` ni `seller`.

### Riesgo si se rompe

- perdida masiva de datos
- borrado incompleto
- huellas huerfanas en auth o tablas auxiliares

### Criticidad

- funcional: muy alta
- operativa: muy alta
- seguridad: extrema

## Relacion entre estas tres RPCs

Estas funciones cubren:

1. editar admin
2. eliminar vendedor
3. eliminar admin completo

Eso las vuelve un bloque natural para auditar como modulo de administracion.

## Recomendacion siguiente

Despues de este bloque, el siguiente grupo natural es el de loterias y configuracion:

- `get_lottery_billete_multipliers`
- `update_lottery_multipliers`
- `update_lottery_prices`
- `update_national_config`
- `deactivate_lottery`
- `reactivate_lottery`

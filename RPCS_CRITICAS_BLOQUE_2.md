# RPCs Criticas - Bloque 2

## Objetivo

Documentar dos RPCs muy sensibles del frontend activo:

- `setup_new_user`
- `change_user_password`

Estas funciones tocan altas de usuarios y credenciales.

Por eso deben tratarse con mas cuidado que las RPC de consulta.

## 1. `setup_new_user`

### Donde se usa

Frontend activo:

- `src/pages/admin/ManageSellers.jsx`
- `src/pages/superadmin/ManageAdmins.jsx`

### Flujo funcional

El frontend NO crea el perfil completo directamente en una sola operacion.

Hace esto:

1. usa `createAuthUser(...)`
   - eso crea el usuario en auth
2. luego llama `setup_new_user(...)`
   - eso completa o corrige el registro en `profiles`

Referencia:

- `src/lib/helpers.js`

### Parametros observados

#### Creacion de vendedor o sub-admin

Usados desde `ManageSellers`:

```sql
p_user_id UUID,
p_role TEXT,
p_full_name TEXT,
p_phone TEXT,
p_email TEXT,
p_seller_percentage NUMERIC,
p_parent_admin_id UUID,
p_currency_code TEXT,
p_currency_symbol TEXT
```

#### Creacion de admin

Usados desde `ManageAdmins`:

```sql
p_user_id UUID,
p_role TEXT,
p_full_name TEXT,
p_phone TEXT,
p_expires_at TIMESTAMPTZ,
p_max_sellers INTEGER,
p_email TEXT
```

### Conclusiones del contrato

La RPC debe aceptar al menos la union de ambos conjuntos de parametros.

Eso sugiere que:

- algunos parametros son opcionales segun el rol
- la logica interna probablemente arma el perfil segun `p_role`

### Efectos esperados

#### Si el rol es `seller`

Debe dejar correctamente en `profiles`:

- `role = 'seller'`
- `parent_admin_id`
- `seller_percentage`
- `currency_code`
- `currency_symbol`
- estado activo por defecto

#### Si el rol es `sub_admin`

Debe dejar correctamente:

- `role = 'sub_admin'`
- `parent_admin_id`
- moneda y datos base

#### Si el rol es `admin`

Debe dejar correctamente:

- `role = 'admin'`
- `expires_at`
- `max_sellers`

### Reglas de seguridad

Esta RPC no debe poder ser llamada libremente por cualquier usuario autenticado para crear perfiles arbitrarios.

Comportamiento seguro recomendado:

- solo `admin` o `super_admin` pueden usarla
- `admin` solo puede crear usuarios bajo su propio alcance
- `super_admin` puede crear admins

### Riesgo si se rompe

- usuarios creados en auth sin perfil correcto
- cuentas imposibles de usar al hacer login
- relaciones admin-vendedor mal asignadas
- moneda, limites o comision mal inicializados

### Nivel de criticidad

- funcional: alta
- operativa: alta
- seguridad: alta

## 2. `change_user_password`

### Donde se usa

Frontend activo:

- `src/pages/admin/ManageSellers.jsx`
- `src/pages/superadmin/ManageAdmins.jsx`

Modulo legado:

- `src/app.js`

### Flujo funcional

Solo se invoca cuando se edita un usuario existente y el campo password no viene vacio.

No se usa para login ni para reset de password publico.

### Parametros observados

```sql
p_user_id UUID,
p_new_password TEXT
```

### Efecto esperado

Debe cambiar la credencial del usuario objetivo sin alterar:

- `profiles`
- rol
- relaciones admin-vendedor
- configuracion de moneda o limites

### Regla de seguridad

Esta RPC debe ser fuertemente restringida.

Comportamiento seguro recomendado:

- un admin solo puede cambiar password de usuarios dentro de su alcance
- un super_admin puede cambiar password de admins
- un seller no debe poder usarla para otros usuarios

### Riesgo si se rompe

- cambio de contraseña en usuario incorrecto
- escalacion de privilegios
- cuentas bloqueadas
- imposibilidad de acceso para vendedores o admins

### Nivel de criticidad

- funcional: alta
- operativa: alta
- seguridad: muy alta

## Dependencias relacionadas

Estas dos RPCs dependen del flujo completo de alta/edicion de usuarios:

- `createAuthUser(...)` en `src/lib/helpers.js`
- `setup_new_user(...)`
- `change_user_password(...)`

Si luego se audita este bloque a fondo, conviene mirarlo como un solo modulo.

## Recomendacion siguiente

Despues de este bloque, el siguiente grupo natural es:

- `update_admin_profile`
- `delete_seller`
- `delete_admin_cascade`

Porque completan el ciclo de vida de usuarios:

1. crear
2. editar
3. cambiar credenciales
4. eliminar

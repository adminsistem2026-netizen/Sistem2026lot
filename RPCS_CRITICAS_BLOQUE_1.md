# RPCs Criticas - Bloque 1

## Objetivo

Documentar las dos primeras RPCs criticas del frontend activo:

- `get_profile_codes`
- `get_admin_daily_sales`

La meta de este documento es definir:

1. quien las consume
2. que datos espera el frontend
3. que reglas de seguridad deben respetar
4. que no debemos romper si luego las exportamos o reescribimos

## 1. `get_profile_codes`

### Donde se usa

Frontend activo:

- `src/contexts/AuthContext.jsx`

Modulo legado:

- `src/app.js`

### Uso funcional

Se invoca despues de cargar `profiles.*` para traer columnas o datos complementarios que el SDK no estaba resolviendo bien por cache de esquema.

### Parametros esperados

```sql
p_user_id UUID
```

### Datos que el frontend espera

#### Minimo indispensable para frontend activo

El frontend activo solo necesita:

- `seller_code`

Referencia:

- `src/contexts/AuthContext.jsx`

#### Datos adicionales usados por modulo legado

El modulo legado tambien espera:

- `parent_admin_id`
- `admin_code`

Referencia:

- `src/app.js`

### Forma de retorno esperada

Por el uso en JS, parece devolver una lista y no un objeto simple.

Contrato compatible:

```json
[
  {
    "seller_code": "S001",
    "parent_admin_id": "uuid-opcional",
    "admin_code": "A01"
  }
]
```

El frontend lee:

- `codes?.[0].seller_code`
- `codes?.[0].parent_admin_id`
- `codes?.[0].admin_code`

### Comportamiento esperado

- si el usuario es seller, debe devolver su `seller_code`
- si el usuario no tiene codigo, no debe romper login
- si falla, el frontend activo sigue funcionando porque el bloque ya esta en `try/catch`

### Riesgo si se rompe

- el login sigue entrando
- pero se pierden etiquetas visibles como `seller_code`
- el modulo legado podria perder identificacion visual de admin o vendedor

### Regla de seguridad

Esta RPC nunca deberia devolver datos de un usuario distinto al solicitado sin validar contexto.

Comportamiento seguro recomendado:

- permitir solo `p_user_id = auth.uid()`
- o permitir acceso administrativo bien controlado

## 2. `get_admin_daily_sales`

### Donde se usa

Frontend activo:

- `src/hooks/useLimits.js`

Modulo legado:

- `src/app.js`

### Uso funcional

Se usa para calcular ventas acumuladas del dia entre todos los vendedores de un admin.

Es una RPC critica porque controla limites de venta compartidos.

Si esta RPC devuelve menos ventas de las reales:

- el sistema podria dejar vender de mas

Si devuelve ventas de otro admin:

- el sistema podria bloquear ventas incorrectamente

### Parametros esperados

```sql
p_admin_id UUID,
p_date DATE
```

### Datos que el frontend activo espera

En `src/hooks/useLimits.js`, cada fila debe exponer al menos:

- `lottery_id`
- `draw_time_id`
- `number`
- `total_pieces`

Uso directo:

- filtra por `lottery_id`
- filtra por `draw_time_id`
- suma `total_pieces` por `number`

### Datos adicionales usados por modulo legado

En `src/app.js`, cada fila tambien usa:

- `time_label`
- `digit_count`

Uso directo:

- arma clave por `lottery_id + time_label`
- separa chance y billete por `digit_count`

### Forma de retorno compatible

Contrato recomendable:

```json
[
  {
    "lottery_id": "uuid",
    "draw_time_id": "uuid",
    "time_label": "3:00 PM",
    "number": "12",
    "digit_count": 2,
    "total_pieces": "15"
  }
]
```

### Comportamiento esperado

- sumar ventas del dia indicado
- considerar ventas de todos los vendedores del admin
- excluir tickets cancelados
- mantener separacion por loteria, sorteo y numero

### Reglas de negocio que no debemos romper

- los limites son compartidos entre vendedores del mismo admin
- un vendedor NO debe ver ventas de otros vendedores en su pantalla
- pero el sistema SI puede usar el agregado del admin para bloquear sobreventa

Esto es clave:

- `get_admin_daily_sales` sirve para logica de limites
- no para mostrar lista de ventas ajenas al vendedor

### Regla de seguridad

La RPC debe devolver solo ventas agregadas del admin consultado.

Comportamiento seguro recomendado:

- permitir al admin consultar su propio agregado
- permitir a sellers solo si la logica valida que pertenecen a ese admin y solo para control de limites
- nunca devolver detalle de tickets ni identidad de otros vendedores

### Riesgo si se rompe

- sobreventa por limites mal calculados
- bloqueo falso de numeros
- inconsistencias entre vendedores del mismo admin

## Nivel de criticidad

### `get_profile_codes`

- criticidad funcional: media
- criticidad operativa: media
- criticidad de seguridad: media

### `get_admin_daily_sales`

- criticidad funcional: alta
- criticidad operativa: alta
- criticidad de seguridad: alta

## Recomendacion siguiente

Cuando toque rescatar estas RPC al repo, conviene hacerlo en este orden:

1. documentar firma SQL real
2. exportar version actual desde produccion o reconstruirla
3. validar retorno real contra lo que espera `src/hooks/useLimits.js`
4. probar venta, limites y login antes de tocar otra RPC

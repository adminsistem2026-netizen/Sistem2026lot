# Auditoria RLS por Roles

## Objetivo

Dejar una guia clara para validar que cada rol solo puede ver y modificar lo que le corresponde, sin romper el sistema que hoy ya funciona.

La regla mas sensible del negocio queda fijada aqui:

- un `seller` en la app movil solo debe ver sus propias ventas y sus propios premios

## Alcance

Esta auditoria cruza tres cosas:

1. lo que el frontend intenta hacer
2. lo que `database/schema.sql` declara como RLS
3. las brechas que sugieren que la base real tiene reglas mas avanzadas que el repo

## Regla por rol

### `seller`

Debe poder:

- ver sus propias loterias disponibles
- ver horarios de esas loterias
- crear sus propios tickets
- ver sus propios tickets del dia o por fecha
- anular sus propios tickets dentro de la ventana permitida
- marcar como cobrado un ticket propio si el negocio lo permite
- consultar sus propios premios
- leer limites aplicables a sus ventas

No debe poder:

- ver tickets de otro vendedor
- ver premios de otro vendedor
- ver configuracion operativa de otro admin
- modificar limites globales
- ver balances o liquidaciones de otros

### `sub_admin`

Debe poder, si ese rol sigue activo en operacion:

- ver solo los vendedores asignados bajo su alcance
- ver ventas agregadas solo de su red
- ver premios agregados solo de su red

No debe poder:

- salir del alcance del admin padre
- ver o borrar vendedores de otro sub-admin
- operar loterias de otro admin

### `admin`

Debe poder:

- ver toda su red de vendedores y sub-admins
- ver ventas agregadas de su propia red
- gestionar loterias, horarios, limites y resultados de su propia red
- consultar balances, premios y tickets ganadores de su propia red

No debe poder:

- ver datos operativos de otro admin
- editar loterias o limites de otro admin

### `super_admin`

Debe poder:

- gestionar admins
- ver y mantener configuracion global
- ejecutar tareas de mantenimiento de alto nivel

Debe usarse con cuidado extra en:

- borrados en cascada
- cambios de configuracion global
- limpiezas de datos

## Lo que el frontend ya hace bien

### Ventas del vendedor

En `src/hooks/useTickets.js`:

- la creacion de tickets guarda `seller_id = profile.id`
- la carga de ventas usa `.eq('seller_id', profile.id)`

Eso alinea bien con la regla:

- el vendedor solo ve lo suyo

### Premios del vendedor

En `src/pages/seller/SellerPremios.jsx`:

- la RPC `get_seller_winning_tickets` se invoca con `p_seller_id = profile.id`

Otra vez, la UI ya apunta al alcance correcto.

## Brechas o alertas detectadas en el repo

## 1. `sales_limits` del repo no cuadra con el flujo del vendedor

En `src/hooks/useLimits.js`, el vendedor carga:

- `sales_limits`
- `get_admin_daily_sales`

Pero en `database/schema.sql`, la politica actual es:

```sql
CREATE POLICY "sales_limits_all" ON public.sales_limits
  FOR ALL USING (
    admin_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
```

Eso significa que, si esa politica fuera la real, un `seller` no podria leer limites.

Como la app funciona, hay dos posibilidades:

1. la base real tiene una politica mas amplia que el repo
2. InsForge esta resolviendo esto con otra capa no documentada aqui

Conclusion:

- `schema.sql` no representa fielmente el acceso real de `seller` a limites

## 2. `sub_admin` no aparece bien resuelto en varias politicas del repo

Ejemplos:

- `tickets_select`
- `winning_tickets_admin_select`
- `settlements_select`
- `profiles_select`

En esos casos el repo contempla mejor:

- `seller`
- `admin`
- `super_admin`

Pero deja poco claro el alcance real de `sub_admin`.

Conclusion:

- si `sub_admin` esta en uso productivo, sus reglas reales no estan bien versionadas en el repo

## 3. `winning_tickets` del repo no contempla explicitamente `sub_admin`

En `database/winning_tickets_migration.sql`:

```sql
CREATE POLICY winning_tickets_admin_select ON public.winning_tickets
  FOR SELECT USING (admin_id = auth.uid() OR seller_id = auth.uid());
```

Eso cubre:

- admin
- seller

Pero no expresa acceso de `sub_admin` a premios de su red, si esa funcion existe en produccion.

## 4. `settlements` del repo tampoco contempla `sub_admin`

En `database/balance_settlements_migration.sql`:

```sql
CREATE POLICY settlements_select ON public.settlements
  FOR SELECT USING (admin_id = auth.uid() OR seller_id = auth.uid());
```

Otra vez:

- admin y seller si
- sub_admin no aparece

## 5. El repo permite a `seller` actualizar tickets propios

En `database/schema.sql`, `tickets_update` permite:

- `seller_id = auth.uid()`

Eso puede ser correcto si solo se usa para:

- anular ticket propio
- marcar ticket propio como cobrado

Pero conviene validar en base real que no permita actualizar campos que no deberia tocar.

Ejemplos a revisar:

- `admin_id`
- `seller_id`
- `lottery_id`
- `draw_time_id`
- `total_amount`

Lo ideal seria que el frontend pueda hacer la operacion necesaria, pero que la base limite cambios sensibles por columna o por flujo controlado.

## Checklist de validacion en base real

## Seller

Probar autenticado como vendedor:

- leer tickets: solo propios
- leer ticket_numbers: solo de tickets propios
- leer premios: solo propios
- leer limites: solo del admin asociado y solo para vender
- intentar leer tickets de otro vendedor: debe fallar o devolver vacio
- intentar actualizar ticket ajeno: debe fallar

## Sub-admin

Probar autenticado como sub-admin:

- leer solo vendedores de su alcance
- leer solo ventas de su alcance
- leer solo premios de su alcance
- no poder ver red de otro sub-admin
- no poder tocar loterias de otro admin

## Admin

Probar autenticado como admin:

- leer toda su red
- no leer tickets de otro admin
- no modificar loterias de otro admin
- no borrar vendedores fuera de su red

## Super-admin

Probar autenticado como super-admin:

- ver admins
- ejecutar funciones globales esperadas
- confirmar que las acciones destructivas estan reservadas

## Archivos del frontend que conviene usar como referencia

- `src/hooks/useTickets.js`
- `src/hooks/useLimits.js`
- `src/pages/seller/SellerSales.jsx`
- `src/pages/seller/SellerPremios.jsx`
- `src/pages/admin/AdminSales.jsx`
- `src/pages/admin/AdminPremios.jsx`
- `src/pages/admin/AdminBalance.jsx`
- `src/pages/admin/ManageSellers.jsx`

## Conclusion operativa

La UI actual ya respeta bastante bien la regla de alcance por rol, en especial para `seller`.

La parte mas debil no parece ser React, sino la falta de versionado fiel de las politicas reales en el repo.

Por eso, el siguiente paso correcto no es reescribir permisos a ciegas, sino:

1. exportar o reconstruir las politicas reales de produccion
2. comparar contra esta checklist
3. solo despues alinear los SQL del repo

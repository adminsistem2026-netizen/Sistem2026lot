# RPCs Criticas - Bloque 4

## Objetivo

Documentar el bloque de RPCs de loterias y configuracion que usa el frontend activo:

- `get_lottery_billete_multipliers`
- `update_lottery_multipliers`
- `update_lottery_prices`
- `update_national_config`
- `deactivate_lottery`
- `reactivate_lottery`

Este bloque no toca directamente ventas de vendedores, pero si define reglas de negocio que luego impactan:

- precios
- multiplicadores
- modalidad de loterias nacionales
- disponibilidad de loterias para vender

## 1. `get_lottery_billete_multipliers`

### Donde se usa

Frontend activo:

- `src/pages/admin/ManageLotteries.jsx`
- `src/pages/admin/AdminNumbers.jsx`

Modulo legado relacionado:

- `src/app.js`

### Efecto esperado

Debe devolver por loteria los campos que el frontend no esta pudiendo leer de forma confiable con `select(*)`.

Por uso observado, al menos debe incluir:

- `id`
- `billete_prize_1st_multiplier`
- `billete_prize_2nd_multiplier`
- `billete_prize_3rd_multiplier`

Y por el formulario actual, idealmente tambien:

- `lottery_modality`
- `nat_mult_3match_1`
- `nat_mult_3match_2`
- `nat_mult_3match_3`
- `nat_mult_2first_1`
- `nat_mult_2last_1`
- `nat_mult_2last_2`
- `nat_mult_2last_3`
- `nat_mult_1last_1`

### Regla de seguridad

Debe devolver solo loterias dentro del alcance del admin autenticado, o devolver todas si esta disenada como lectura interna segura y el frontend ya filtra por `admin_id`.

### Riesgo si se rompe

- formularios de loterias incompletos
- calculos de billetes incorrectos en vistas admin
- configuracion nacional cargada a medias

### Criticidad

- funcional: alta
- operativa: media-alta
- seguridad: media

## 2. `update_lottery_multipliers`

### Donde se usa

Frontend activo:

- `src/pages/admin/ManageLotteries.jsx`

### Parametros observados

```sql
p_lottery_id UUID,
p_m1 NUMERIC,
p_m2 NUMERIC,
p_m3 NUMERIC,
p_bm1 NUMERIC,
p_bm2 NUMERIC,
p_bm3 NUMERIC
```

### Efecto esperado

Debe actualizar en la loteria objetivo:

- `prize_1st_multiplier`
- `prize_2nd_multiplier`
- `prize_3rd_multiplier`
- `billete_prize_1st_multiplier`
- `billete_prize_2nd_multiplier`
- `billete_prize_3rd_multiplier`

### Regla de seguridad

Debe validar que la loteria pertenezca al admin autenticado.

No debe permitir que un admin actualice loterias de otro admin.

### Riesgo si se rompe

- premios mal calculados
- desajuste entre configuracion visible y persistida
- loterias vendiendo con tablas de pago equivocadas

### Criticidad

- funcional: alta
- operativa: alta
- seguridad: alta

## 3. `update_lottery_prices`

### Donde se usa

Frontend activo:

- `src/pages/admin/ManageLotteries.jsx`

### Parametros observados

```sql
p_lottery_id UUID,
p_price_2 NUMERIC,
p_price_4 NUMERIC
```

### Efecto esperado

Debe actualizar:

- `price_2_digits`
- `price_4_digits`

### Regla de seguridad

Misma regla del bloque anterior:

- solo el admin duenio de la loteria debe poder cambiar precios

### Riesgo si se rompe

- ventas cobradas con precio equivocado
- diferencias entre app movil y calculos del backend
- reclamos operativos por cobros incorrectos

### Criticidad

- funcional: muy alta
- operativa: muy alta
- seguridad: alta

## 4. `update_national_config`

### Donde se usa

Frontend activo:

- `src/pages/admin/ManageLotteries.jsx`

### Parametros observados

```sql
p_lottery_id UUID,
p_modality TEXT,
p_nat_3match_1 NUMERIC,
p_nat_3match_2 NUMERIC,
p_nat_3match_3 NUMERIC,
p_nat_2first_1 NUMERIC,
p_nat_2last_1 NUMERIC,
p_nat_2last_2 NUMERIC,
p_nat_2last_3 NUMERIC,
p_nat_1last_1 NUMERIC
```

### Efecto esperado

Debe actualizar la configuracion propia de loterias `nacional`, incluyendo:

- modalidad (`dominical`, `gordito`, u otra soportada)
- multiplicadores de coincidencias parciales

### Regla de seguridad

Debe ejecutar solo si:

- la loteria pertenece al admin autenticado
- la loteria realmente es de tipo `nacional`, o al menos la funcion debe manejar ese caso de forma segura

### Riesgo si se rompe

- premios nacionales mal calculados
- modalidad visible distinta a la persistida
- incoherencia entre venta, resultados y premios

### Criticidad

- funcional: muy alta
- operativa: alta
- seguridad: alta

## 5. `deactivate_lottery`

### Donde se usa

Frontend activo:

- `src/pages/admin/ManageLotteries.jsx`

### Parametros observados

```sql
p_id UUID
```

### Efecto esperado

Debe desactivar una loteria sin borrarla.

Lo normal es que cambie algun estado como:

- `is_active = false`

Y que despues esa loteria deje de aparecer como vendible en interfaces operativas.

### Regla de seguridad

Debe validar propiedad de la loteria por admin.

### Riesgo si se rompe

- loterias inactivas que siguen vendiendose
- loterias activas ocultadas por error

### Criticidad

- funcional: alta
- operativa: media-alta
- seguridad: media

## 6. `reactivate_lottery`

### Donde se usa

Frontend activo:

- `src/pages/admin/ManageLotteries.jsx`

### Parametros observados

```sql
p_id UUID
```

### Efecto esperado

Debe reactivar una loteria previamente desactivada.

Lo normal es:

- `is_active = true`

### Regla de seguridad

Igual que la anterior:

- solo el admin duenio debe poder reactivar

### Riesgo si se rompe

- loterias no recuperables desde UI
- errores operativos por activacion cruzada

### Criticidad

- funcional: media-alta
- operativa: media
- seguridad: media

## Dependencia cercana: `get_numbers_for_admin`

Aunque no forma parte del formulario de configuracion, aparecio en:

- `src/pages/admin/AdminNumbers.jsx`

### Por que importa aqui

Esa pantalla mezcla:

- filtros de vendedores
- loterias
- horarios
- resultados
- multiplicadores de billete

Por eso conviene tratar `get_numbers_for_admin` como RPC cercana al bloque de loterias/admin, aunque en `RPCS_SISTEMA.md` siga marcada como dependencia heredada o pendiente de rescate formal.

### Regla critica a conservar

Esta RPC puede agregar informacion para el admin, pero no debe debilitar la regla principal del sistema:

- un `seller` en movil solo debe ver sus propias ventas

## Relacion entre estas RPCs

Estas funciones cubren:

1. lectura de multiplicadores especiales
2. actualizacion de tabla de premios
3. actualizacion de precios
4. configuracion especial de loterias nacionales
5. activacion y desactivacion operativa

Eso las vuelve el bloque natural de configuracion de loterias del frontend activo.

## Recomendacion siguiente

Despues de este bloque, el siguiente paso correcto es la auditoria de permisos y RLS por rol:

- `seller`
- `sub_admin`
- `admin`
- `super_admin`

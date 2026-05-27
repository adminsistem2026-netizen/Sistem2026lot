# Plan De Balance Cuenta Corriente

## Regla de negocio

- El balance entre admin y vendedor es una cuenta corriente bilateral.
- Los premios que afectan el balance son los generados en `winning_tickets`.
- No importa si el vendedor ya pagó el premio al cliente final.

## Fórmula oficial

`neto_periodo = ventas - comision - premios_generados`

`saldo_actual = neto_periodo - cortes_registrados`

Convención de cortes:

- `amount > 0`: el vendedor entrega dinero al admin
- `amount < 0`: el admin entrega dinero al vendedor

## Objetivos

1. Unificar todas las RPCs de balance bajo una sola matemática.
2. Permitir cortes positivos, negativos y parciales sin depender del "último residual".
3. Hacer que el resumen y el detalle muestren la misma realidad contable.
4. Mantener compatibilidad con las firmas antiguas usadas por el proyecto.

## Paso a paso

1. Reemplazar la lógica de `get_seller_balance` por saldo vivo:
   - ventas del alcance
   - comisión del alcance
   - premios generados del alcance
   - suma de cortes registrados del mismo alcance

2. Reemplazar `get_all_sellers_balance` con la misma matemática del punto 1.

3. Cambiar `create_settlement` para que registre movimientos contra el saldo actual:
   - corte total
   - corte parcial
   - corte positivo
   - corte negativo

4. Mantener wrappers para firmas viejas:
   - `create_settlement(admin, seller, notes)`
   - `create_settlement(admin, seller, amount, notes)`
   - `get_seller_balance_for_seller(...)`
   - `get_settlements_history(admin, seller)`

5. Separar en UI:
   - neto operativo del período
   - cortes registrados
   - saldo actual

6. Evitar en UI fórmulas derivadas de "pendiente anterior".

## Archivos aplicados

- `database/balance_accounting_unification.sql`
- `database/balance_accounting_unification_v2.sql`
- `src/pages/admin/AdminBalance.jsx`
- `src/pages/seller/SellerBalance.jsx`

## Nota operativa

- Usar `database/balance_accounting_unification_v2.sql` como parche final.
- La version anterior fue un primer corte de unificacion, pero `v2` corrige el descuento de cortes por solapamiento de rango y evita seguir dependiendo del residual historico.

## Validación esperada

- Si el período da `+200` y se registra corte `+200`, el saldo queda `0`.
- Si luego otro período da `-80`, el saldo queda `-80`.
- Si se registra corte `-30`, el saldo queda `-50`.
- El resumen general y la vista por vendedor deben mostrar el mismo saldo para el mismo alcance.

# Matriz Final RLS

## Objetivo

Unificar en una sola vista:

1. lo que hoy dice el repo
2. lo que proponen los archivos candidatos
3. lo que todavia debe confirmarse contra produccion

Esta matriz no cambia codigo ni base de datos.

Sirve como puente entre la fase documental y la fase de comparacion real con produccion.

## Lectura rapida

### Ya bien cubierto en candidatos

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

### Tablas mas delicadas

- `sales_limits`
- `tickets`
- `winning_tickets`
- `profiles`

### Motivo

Porque mezclan:

- alcance por rol
- operaciones sensibles
- riesgo de fuga de datos o updates demasiado amplios

## Matriz por tabla

## 1. `sales_limits`

### Repo actual

- `schema.sql` solo deja acceso directo a `admin` y `super_admin`

### Candidato

- lectura para usuarios de la red del admin
- escritura reservada a `admin` y `super_admin`

Archivo:

- `database/rls_candidate_mobile_scope.sql`

### Confirmar en produccion

- si `seller` realmente lee limites por RLS o por otra capa
- si `sub_admin` tambien los puede leer
- si la lectura debe ser total para la red o mas acotada

### Riesgo si aplicamos mal

- vendedor sin validacion de limites
- o lectura de limites mas amplia de lo necesario

## 2. `tickets`

### Repo actual

- `seller` lee y actualiza tickets propios
- `admin` lee por `admin_id`
- `sub_admin` no queda claro

### Candidato

- `seller` solo sus tickets
- `sub_admin` su red
- `admin` su red
- `super_admin` global
- insert del vendedor validando `admin_id` coherente con su admin padre

Archivo:

- `database/rls_candidate_mobile_scope.sql`

### Confirmar en produccion

- si `sub_admin` realmente puede leer tickets de su red
- si hay trigger o RPC que limite columnas editables por vendedor

### Riesgo si aplicamos mal

- vendedor viendo tickets ajenos
- vendedor editando campos que no debe

## 3. `ticket_numbers`

### Repo actual

- lectura e insercion heredan desde tickets

### Candidato

- mismo alcance que `tickets`
- insercion solo por el vendedor duenio del ticket

Archivo:

- `database/rls_candidate_mobile_scope.sql`

### Confirmar en produccion

- si existe alguna politica adicional para sub-admin
- si hay updates ocultos no versionados

### Riesgo si aplicamos mal

- numeracion expuesta fuera del alcance correcto

## 4. `winning_tickets`

### Repo actual

- lectura para `admin` o `seller`
- update del `seller`
- `sub_admin` no aparece

### Candidato

- lectura por alcance para `seller`, `sub_admin`, `admin`, `super_admin`
- update para `seller`, `admin`, `super_admin`

Archivo:

- `database/rls_candidate_catalog_scope.sql`

### Confirmar en produccion

- si `sub_admin` ve premios de su red
- si `seller` solo puede tocar `is_paid`, `paid_at`, `paid_by`
- si el pago de premios ya esta protegido por otra capa

### Riesgo si aplicamos mal

- fuga de premios entre redes
- update demasiado amplio en pagos

## 5. `lotteries`

### Repo actual

- lectura por `admin_id`, loterias globales y relacion con `parent_admin_id`

### Candidato

- lectura por admin padre para vendedor/sub-admin
- escritura solo `admin` duenio o `super_admin`

Archivo:

- `database/rls_candidate_catalog_scope.sql`

### Confirmar en produccion

- si la regla de `sub_admin` es igual a la propuesta
- si la app depende de que el filtro de activas siga siendo solo frontend

### Riesgo si aplicamos mal

- loterias invisibles para vendedores
- o lectura cruzada entre admins

## 6. `draw_times`

### Repo actual

- hereda desde loterias

### Candidato

- misma idea, pero expresada alineada con el modelo real sin `draw_times.admin_id`

Archivo:

- `database/rls_candidate_catalog_scope.sql`

### Confirmar en produccion

- si la herencia desde `lotteries.admin_id` es realmente la usada
- si `sub_admin` comparte exactamente la misma lectura

### Riesgo si aplicamos mal

- horarios vacios en vendedor o admin

## 7. `profiles`

### Repo actual

- usuario propio
- red del admin
- `super_admin`
- `sub_admin` poco claro

### Candidato

- agrega lectura de vendedores asignados por `sub_admin_id`
- mantiene admin y super-admin

Archivo:

- `database/rls_candidate_support_scope.sql`

### Confirmar en produccion

- alcance exacto de `sub_admin`
- si admin puede o no editar todos los campos hoy
- si produccion ya separa autoservicio y administracion por RPC

### Riesgo si aplicamos mal

- fuga de perfiles
- edicion de campos sensibles fuera de control

## 8. `settlements`

### Repo actual

- `admin` o `seller`

### Candidato

- agrega lectura para `sub_admin` sobre vendedores asignados
- mantiene insert para `admin` o `super_admin`

Archivo:

- `database/rls_candidate_support_scope.sql`

### Confirmar en produccion

- si `sub_admin` realmente participa en balances
- si existen updates o deletes operativos en produccion

### Riesgo si aplicamos mal

- exposición de cortes fuera del alcance correcto

## 9. `winning_numbers`

### Repo actual

- select abierto
- insert admin/super-admin

### Candidato

- mantiene select abierto
- insert ligado a la loteria del admin
- agrega delete para soportar el flujo actual de `ManageResults`

Archivo:

- `database/rls_candidate_global_scope.sql`

### Confirmar en produccion

- si resultados se corrigen con delete+insert o por update
- si `registered_by` participa realmente en control de borrado

### Riesgo si aplicamos mal

- admin sin poder corregir resultados
- o borrado mas amplio del debido

## 10. `system_config`

### Repo actual

- lectura abierta
- update para `super_admin`

### Candidato

- mantiene lectura abierta
- agrega insert/delete para `super_admin`

Archivo:

- `database/rls_candidate_global_scope.sql`

### Confirmar en produccion

- si existen filas nuevas creadas manualmente
- si realmente hace falta delete

### Riesgo si aplicamos mal

- poca cosa comparado con otras tablas, pero podria afectar configuracion global

## Matriz de prioridad de comparacion con produccion

### Comparar primero

1. `sales_limits`
2. `tickets`
3. `winning_tickets`
4. `profiles`

### Comparar despues

5. `ticket_numbers`
6. `lotteries`
7. `draw_times`
8. `settlements`

### Comparar al final

9. `winning_numbers`
10. `system_config`

## Decision recomendada

No aplicar ningun candidato directo todavia.

Primero conviene:

1. exportar o inspeccionar politicas reales de produccion
2. comparar tabla por tabla contra esta matriz
3. marcar por tabla si:
   - produccion ya esta mejor que el repo
   - el candidato coincide
   - el candidato necesita ajustes

## Resultado esperado de la siguiente fase

Salir con una tabla final de estado por objeto:

- `igual a produccion`
- `ajustar antes de versionar`
- `no tocar aun`

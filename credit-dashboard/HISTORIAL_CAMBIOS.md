# Historial de Cambios - Beirut Sistema de Control

Este archivo mantiene un registro de los cambios mayores, refactorizaciones y correcciones aplicadas al proyecto. √ötil para mantener el contexto entre diferentes sesiones de desarrollo o cuentas.

---

## [14 de Marzo 2026] - Reversi√≥n y Estabilizaci√≥n del Modal de Perfil de Cliente

**Descripci√≥n de la tarea:**
El proyecto sufri√≥ una propagaci√≥n no deseada de un dise√±o experimental de modal (`ClientMasterProfileNew.tsx`). Se solicit√≥ una reversi√≥n de emergencia del modal al estado original guardado en GitHub y la correcci√≥n de un bug cr√≠tico de pantalla blanca (White Screen of Death).

**Archivos modificados:**
- `src/components/ClientMasterProfile.tsx` (Target Principal)
- `src/components/ClientMasterProfileNew.tsx`
- `src/views/ClientList.tsx`

**Cambios Aplicados:**
1. **Reversi√≥n de C√≥digo (`ClientMasterProfile.tsx`):**
   - Se restaur√≥ el archivo a su versi√≥n estable y original desde GitHub (commit `cc0314d`).
   - Se le aplic√≥ el √∫nico ajuste del plan de redise√±o deseado: Se reemplaz√≥ la clase `max-w-lg` por `max-w-[520px]` para limitar el ancho del modal de forma precisa.
   - La l√≥gica original para ocultar los montos de la cuenta (`****`) ya funcionaba correctamente en este commit base, por lo que no se requirieron m√°s alteraciones al DOM.

2. **Resoluci√≥n de Pantalla en Blanco (Crash Silencioso de Vite/React):**
   - **Causa:** Vite estaba fallando cr√≠pticamente porque `ClientList.tsx` estaba importando exportaciones inv√°lidas de `ClientMasterProfileNew.tsx`.
   - **Soluci√≥n Parte 1:** Se restaur√≥ el import en `src/views/ClientList.tsx` para que apunte nuevamente y de manera exclusiva a la versi√≥n estable del modal (`ClientMasterProfile`).
   - **Soluci√≥n Parte 2:** Se corrigi√≥ el c√≥digo dentro de `ClientMasterProfileNew.tsx` (para que no rompa el HMR si queda en el c√≥digo): 
     - Se resolvieron violaciones de React Hooks, moviendo llamadas a `useMemo` y `useCallback` hacia arriba, **antes** del early return (`if(!client) return null`).
     - Se arregl√≥ una excepci√≥n letal silenciada producida al leer `client.name` antes del early return usando optional chaining (`client?.name`).

**Estado Final:** 
La aplicaci√≥n de React renderiza el dashboard correctamente. El modal de perfil del cliente regres√≥ a la normalidad respetando la limitaci√≥n de ancho requerida en el plan de redise√±o y no hay errores de sintaxis o Hooks pendientes.

## [14 de Marzo 2026] - RediseÒo Completo del Modal de Factura

**DescripciÛn de la tarea:**
Se reescribiÛ desde cero el componente InvoiceDetailModal para cambiar su layout a 2 columnas y solucionar problemas de desbordamiento de CSS.

**Archivos modificados:**
- src/components/ClientMasterProfile.tsx

**Cambios Aplicados:**
1. **Layout Estabilizado:** Se modificÛ la raÌz del modal para tener un ancho de hasta 860px y dividirse en un ·rea flex (izquierda: scroll de productos, derecha: panel fijo de totales).
2. **Bug Fix del BotÛn Cerrar (X):** Se removiÛ el overflow-hidden crÌtico del divisor padre y se aplicÛ estrictamente en el sub-contenedor del body, permitiendo que el header se dibuje sin cortar los botones.
3. **UI/UX:** IncorporaciÛn de toggle interactivo para ver totales BCV. ImplementaciÛn de hover interactivo en ediciÛn inline de celdas y visibilidad din·mica del botÛn de eliminar(papelera). JerarquÌa visual corregida en totales.

**Estado Final:**
El modal ya no crece infinitamente hacia abajo sino que provee una barra de scroll lateral interna. En pantallas mÛviles se colapsa a una sola columna nativamente. El botÛn X es totalmente visible.


### Ajustes Visuales V2 (Refinamiento EstÈtico)
- Se aplicÛ un tema fondo limpio (\g-white\) y se removieron las divisiones grises para una apariencia m·s fluida.
- La cabecera se reubicÛ al inicio del flujo general para mejor lectura jer·rquica.
- RediseÒo de botones primarios a estilo pill (\ounded-full\) con nueva paleta de color (botones lilas invertidos y botones de cierre neutros).
- EstructuraciÛn de la tarjeta convertidora BCV emulando tarjetas de resalto (bordes amber tenues y fondo c·lido pastel).
- Se aÒadieron iconos gr·ficos en la divisiÛn de 'DESGLOSE'.


### Interfaz Pixel-Perfect V3 (Modal de Factura)
- Se adaptaron todas las medidas al milÌmetro seg˙n maqueta del cliente (\max-w-[700px]\).
- DesapariciÛn de los bordes macizos de estatus en favor de badges pasteles (\g-amber-100/50\ para PENDIENTE).
- SupresiÛn paramÈtrica de cabeceras de desglose priorizando las lÌneas sem·nticas limpias.
- Soporte visual *fake* de decimales con coma (,) en el frontend de precios manteniendo la funcionalidad (punto flotante) en el backend.
- Botones de acciÛn flotando con \bsolute\ anclados al top-right en el contendor relativo padre para m·xima similitud.


# Errores Conocidos — Beirut Credit Dashboard

Registro de errores, causas y soluciones identificados durante el desarrollo y uso del sistema.

---

## 1. Pantalla en blanco al cargar la app

**Síntoma:** La app abre una ventana completamente blanca sin mostrar ningún contenido.

**Causa:** El servidor de desarrollo (`npm run dev`) no está corriendo en la máquina local.

**Solución:**
```bash
cd credit-dashboard
npm run dev
```
Luego abrir `http://localhost:5173` en el navegador.

**Nota:** En producción (Vercel) esto no aplica, ya que el servidor siempre está activo.

---

## 2. Error "date/time field value out of range" al asignar crédito

**Síntoma:** Al intentar confirmar una asignación de crédito en el modal **"Asignar Crédito a Cliente"**, aparece el error:
```
date/time field value out of range: "13/03/2026"
```

**Causa:** Las fechas exportadas por Valery en Excel vienen en formato `DD/MM/YYYY`, pero Supabase/PostgreSQL exige el formato ISO `YYYY-MM-DD`.

**Solución aplicada (2026-03-16):** Se agregó la función `normalizeToISO()` en `AssignCreditModal.tsx` que convierte automáticamente el formato antes de enviar los datos a la base de datos.

**Archivos modificados:** `src/components/AssignCreditModal.tsx`

---

## 3. Error `net::ERR_CONNECTION_CLOSED` en Supabase

**Síntoma:** En la consola del navegador aparece:
```
ERR_CONNECTION_CLOSED — rest/v1/clients?select=id&limit=1
```

**Causa:** Ping de health-check a Supabase bloqueado momentáneamente (red o timeout transitorio).

**Impacto:** Ninguno — es un error no crítico. Los datos se cargan igual a través de las consultas principales.

**Solución:** Ninguna requerida. Si ocurre de forma persistente, verificar la conexión a internet o el estado de Supabase en [status.supabase.com](https://status.supabase.com).

---

## 4. Advertencia: múltiples instancias de `GoTrueClient`

**Síntoma:** En consola aparece una advertencia sobre múltiples instancias del cliente de autenticación de Supabase.

**Causa:** El cliente de Supabase se instancia en más de un módulo (`useClients.ts` y `supabase.ts`).

**Impacto:** Advertencia cosmética. No afecta la funcionalidad.

**Solución pendiente:** Centralizar la instancia de Supabase en un único archivo (`src/lib/supabase.ts`) e importarlo desde ahí en todos los módulos.

---

*Última actualización: 2026-03-16*

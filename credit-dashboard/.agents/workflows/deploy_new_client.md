---
description: Cómo instalar y desplegar el sistema para un cliente nuevo desde CERO (Cuentas Nuevas)
---

# Flujo de Trabajo: Despliegue para Cliente Nuevo (Aislamiento Total)

Sigue estos pasos EXACTAMENTE en este orden cada vez que vendas el sistema a una empresa nueva (ej. "Distribuidora ACME"). Este proceso garantiza que el cliente tenga servidores, correos y bases de datos 100% suyas y separadas de las tuyas.

## Paso 0: Identidad y Claves
1. Crea un **Nuevo Correo Electrónico** para administrar la cuenta del cliente. 
   - *Ejemplo: `sistemas.acme@gmail.com`*
2. Anótalo en un bloc de notas junto con una contraseña maestra segura que usarás para todos los servicios de este cliente.

## Paso 1: Repositorio de Código (GitHub)
1. Ve a [GitHub](https://github.com/) y regístrate usando el correo nuevo (`sistemas.acme@gmail.com`).
2. Crea un **Nuevo Repositorio Privado** llamado `dashboard-acme` (o el nombre que prefieras).
3. En tu computadora (en tu terminal Git), sube una copia exacta de tu código actual a este nuevo repositorio. 
   - *Nota: Asegúrate de borrar la carpeta `.git` local temporalmente si ibas a copiar la carpeta física, y hacer un `git init` nuevo para enlazarlo con el GitHub del cliente.*

## Paso 2: Crear la Base de Datos (Supabase)
1. Ve a [Supabase](https://supabase.com/) y haz clic en "Sign in with GitHub" usando la cuenta nueva (autoriza la aplicación).
2. Crea una organización y haz clic en **"New Project"**.
3. Nombra al proyecto `Base de Datos ACME` y genera una contraseña.
4. Una vez creado (tarda unos minutos), ve a la pestaña **"SQL Editor"**.
5. Copia el contenido de tu archivo local `database/schema.sql`, pégalo en el editor y haz clic en **"Run"**. Verifica que haya sido un éxito.
6. Ve a **"Project Settings"** (engranaje) -> **"API"**. 
7. Copia y guarda la **Project URL** y la **anon public API Key** en tu bloc de notas. Las necesitas para Vercel.

## Paso 3: Desplegar el Sistema (Vercel)
1. Ve a [Vercel](https://vercel.com/) y haz clic en "Sign Up" eligiendo **"Continue with GitHub"** (usando la cuenta del cliente).
2. Autoriza Vercel para que pueda leer los repositorios privados de esa cuenta de GitHub.
3. Haz clic en **"Import"** sobre el repositorio `dashboard-acme` que creaste en el Paso 1.
4. Abre la sección **"Environment Variables"** y añade:
   - Name: `VITE_SUPABASE_URL` | Value: *[Pega la URL del Paso 2]*
   - Name: `VITE_SUPABASE_ANON_KEY` | Value: *[Pega la ANON KEY del Paso 2]*
5. Haz clic en **"Deploy"**. Espera a que termine.
6. Copia el enlace en vivo de Vercel (ej. `https://acme-sys.vercel.app`).

## Paso 4: Configurar Autenticación (Supabase Auth)
1. Regresa al Supabase del cliente.
2. Ve a **"Authentication"** -> **"URL Configuration"**.
3. En "Site URL", pega el enlace final de Vercel (`https://acme-sys.vercel.app`).
4. Ve a **"Authentication"** -> **"Users"**.
5. Haz clic en **"Add User"** -> **"Create New User"**.
6. Crea el usuario administrador para el cliente (ej. `admin@acmecorp.com`) con una contraseña segura. 

## Paso 5: Entrega al Cliente
1. Entrégale al dueño de la empresa:
   - Su enlace único para entrar al sistema (`https://acme-sys.vercel.app`)
   - Su usuario y contraseña creados en el Paso 4.
2. (Opcional) Si en el contrato estableciste entregarles toda la infraestructura de servidores, le entregas el correo `sistemas.acme@gmail.com` y su contraseña maestra.

@echo off
echo.
echo ==========================================
echo   Subiendo cambios a Github...
echo ==========================================
echo.

:: 1. Comprobar si el repositorio existe localmente
if not exist ".git" (
    echo [!INFO] Inicializando nuevo repositorio Git local...
    git init
    echo.
)

:: 2. Añadimos todos los cambios
echo [1/3] Preparando archivos (git add)...
git add .
if %errorlevel% neq 0 (
    echo [ERROR] No se pudieron agregar los archivos.
    pause
    exit /b %errorlevel%
)

:: 3. Preguntamos por el mensaje del commit
set /p commit_msg="Introduce el mensaje de los cambios (ej: Se agrego paginacion a facturas): "

:: Si el usuario lo deja vacio ponemos uno por defecto
if "%commit_msg%"=="" (
    set commit_msg="Actualizacion de codigo %date%"
)

echo.
echo [2/3] Creando paquete de cambios (git commit)...
git commit -m "%commit_msg%"
if %errorlevel% neq 0 (
    echo [!INFO] No habia nada nuevo que enviar o todos los cambios ya fueron empaquetados.
)

:: 4. Comprobar si existe un repositorio de origen (remoto) conectado
for /f "delims=" %%i in ('git remote -v') do set "remote_exists=%%i"

if "%remote_exists%"=="" (
    echo.
    echo [!INFO] No tienes tu proyecto conectado a Github todavia.
    echo Ve a Github.com, crea un repositorio nuevo y vacio (sin README ni .gitignore).
    echo Una vez creado, copia el enlace del repositorio (ej: https://github.com/tuUsuario/tuRepo.git)
    echo.
    set /p repo_url="Pega el enlace de Github de tu nuevo repositorio aqui: "
    
    if "%repo_url%"=="" (
        echo [ERROR] Debes poner un enlace para poder subirlo. Cancela y vuelve a intentarlo.
        pause
        exit /b 1
    )
    
    :: Conectar al remoto
    git remote add origin "%repo_url%"
    echo.
    echo Exito! Repositorio conectado a %repo_url%
    echo.
)

:: Nos aseguramos de que la rama se llame main SIEMPRE antes de subir
git branch -M main >nul 2>&1

:: 5. Subimos los datos
echo.
echo [3/3] Enviando cambios a Github (git push)...
git push -u origin main
if %errorlevel% neq 0 (
    echo [ERROR] Hubo un problema al subir los cambios a Github. Comprueba tu conexion o tu enlace.
    pause
    exit /b %errorlevel%
)

echo.
echo ==========================================
echo   [EXITO] Tus cambios ya estan en Github.
echo ==========================================
echo.
pause

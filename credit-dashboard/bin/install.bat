@echo off
title Beirut Credit Dashboard - Instalador
color 0A

echo ===================================================
echo     INSTALADOR DEL SISTEMA DE COBRANZAS "BEIRUT"
echo ===================================================
echo.

:: Moverse al directorio raiz (fuera de bin)
cd /d "%~dp0.."

:: 1. Verify Node.js
echo Verificando instalacion de Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no esta instalado.
    echo Por favor, descargalo de https://nodejs.org/ e instalalo antes de continuar.
    pause
    exit /b 1
)
echo [OK] Node.js esta instalado.
echo.

:: 2. Install Dependencies
echo Instalando dependencias del proyecto (esto puede tomar un minuto)...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Hubo un problema al instalar las dependencias con npm.
    pause
    exit /b 1
)
echo [OK] Dependencias instaladas correctamente.
echo.

:: 3. Create Desktop Shortcut
echo Creando acceso directo en el Escritorio...
set "SCRIPT_PATH=%~dp0iniciar_beirut.vbs"
set "ICON_PATH=%~dp0..\public\favicon.ico"
set "SHORTCUT_PATH=%USERPROFILE%\Desktop\Abrir Beirut.lnk"

:: Use PowerShell to create the shortcut safely in Windows
powershell -Command "$wshell = New-Object -ComObject WScript.Shell; $shortcut = $wshell.CreateShortcut('%SHORTCUT_PATH%'); $shortcut.TargetPath = 'wscript.exe'; $shortcut.Arguments = '\"%SCRIPT_PATH%\"'; $shortcut.IconLocation = '%ICON_PATH%'; $shortcut.WorkingDirectory = '%~dp0..'; $shortcut.Description = 'Sistema de Cobranzas Beirut'; $shortcut.Save()"

if exist "%SHORTCUT_PATH%" (
    echo [OK] Acceso directo creado en el escritorio ("Abrir Beirut").
) else (
    echo [WARNING] No se pudo crear el acceso directo automaticamente. 
    echo Asegurate de ubicar el archivo 'iniciar_beirut.vbs' para iniciar el software.
)
echo.

echo ===================================================
echo   !INSTALACION COMPLETADA EXITOSAMENTE!
echo ===================================================
echo Ya puedes ir a tu escritorio y hacer doble clic en "Abrir Beirut" 
echo para iniciar el dashboard y el servidor local en segundo plano.
echo.
pause

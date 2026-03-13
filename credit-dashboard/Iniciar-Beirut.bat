@echo off
title Beirut — Gestor de Creditos
echo.
echo  ==========================================
echo   Beirut — Iniciando Frontend + Backend...
echo  ==========================================
echo.
cd /d "%~dp0"
start "Beirut Backend" cmd /k "node server/index.js"
timeout /t 2 /nobreak >nul
start "Beirut Frontend" cmd /k "npm run dev"
echo.
echo  Backend  -> http://localhost:3001
echo  Frontend -> http://localhost:5173
echo.
timeout /t 3 /nobreak >nul
start http://localhost:5173

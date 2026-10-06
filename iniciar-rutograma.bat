@echo off
chcp 65001 >nul
title Rutograma Makand
REM ============================================================
REM  Arranca el Rutograma (la app y los datos en el puerto 5000).
REM  Deja esta ventana abierta mientras se use la app.
REM  Se abre en: http://localhost:5000  (o la IP del equipo / Tailscale :5000)
REM ============================================================
cd /d "%~dp0backend"

if not exist "..\mi-rutograma\dist\mi-rutograma\browser\index.html" (
    echo.
    echo  La app todavia no esta compilada.
    echo  Ejecuta primero "actualizar-rutograma.bat" y luego vuelve a abrir este.
    echo.
    pause
    exit /b 1
)

echo.
echo  Iniciando el Rutograma... NO cierres esta ventana mientras se use la app.
echo  Abre en el navegador: http://localhost:5000
echo.
node server.js
echo.
echo  El servidor se detuvo. Vuelve a abrir "iniciar-rutograma.bat" para arrancarlo.
pause

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

REM Direccion segura (https) con Tailscale: si ya se activo con
REM "activar-https.bat", se renueva el certificado (dura 90 dias).
set "DOMINIO="
if exist "certs\dominio-tailscale.txt" set /p DOMINIO=<"certs\dominio-tailscale.txt"
if not "%DOMINIO%"=="" (
    set "TS=tailscale"
    where tailscale >nul 2>nul || set "TS=%ProgramFiles%\Tailscale\tailscale.exe"
    call "%%TS%%" cert --cert-file certs\cert.pem --key-file certs\key.pem %DOMINIO% >nul 2>nul
)

echo.
echo  Iniciando el Rutograma... NO cierres esta ventana mientras se use la app.
echo  Abre en el navegador: http://localhost:5000
if not "%DOMINIO%"=="" echo  Direccion segura (para instalar la app): https://%DOMINIO%:5000
echo.
node server.js
echo.
echo  El servidor se detuvo. Vuelve a abrir "iniciar-rutograma.bat" para arrancarlo.
pause

@echo off
chcp 65001 >nul
title Activar HTTPS - Rutograma Makand
REM ============================================================
REM  Activa la direccion segura (https://) del Rutograma con Tailscale.
REM  Hace falta UNA vez, para poder INSTALAR la app en los celulares
REM  y computadores (sin https el celular no deja instalarla).
REM
REM  Antes, en https://login.tailscale.com/admin/dns (con la cuenta de
REM  Tailscale de la oficina):
REM    1. "MagicDNS"            -> Enable
REM    2. "HTTPS Certificates"  -> Enable
REM
REM  El certificado dura 90 dias: "iniciar-rutograma.bat" lo renueva solo.
REM ============================================================
cd /d "%~dp0backend"

set "TS=tailscale"
where tailscale >nul 2>nul || set "TS=%ProgramFiles%\Tailscale\tailscale.exe"
"%TS%" version >nul 2>nul
if errorlevel 1 (
    echo.
    echo  No se encontro Tailscale en este computador. Instalalo y conectalo primero.
    echo.
    pause
    exit /b 1
)

for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "$s = & '%TS%' status --json | ConvertFrom-Json; $s.Self.DNSName.TrimEnd('.')"`) do set "DOMINIO=%%D"
if "%DOMINIO%"=="" (
    echo.
    echo  No se pudo saber el nombre de este equipo en Tailscale.
    echo  Revisa que Tailscale este conectado y que MagicDNS este activado.
    echo.
    pause
    exit /b 1
)

if not exist certs mkdir certs
echo.
echo  Pidiendo el certificado para %DOMINIO% ...
"%TS%" cert --cert-file certs\cert.pem --key-file certs\key.pem %DOMINIO%
if errorlevel 1 (
    echo.
    echo  No se pudo. Revisa que "HTTPS Certificates" este activado en
    echo  https://login.tailscale.com/admin/dns y vuelve a intentar.
    echo.
    pause
    exit /b 1
)
echo %DOMINIO%> certs\dominio-tailscale.txt

echo.
echo  ============================================================
echo   Listo. Cierra el servidor y vuelve a abrir "iniciar-rutograma.bat".
echo.
echo   La direccion segura para todos (celulares y computadores) es:
echo      https://%DOMINIO%:5000
echo.
echo   Abrela en el celular y en Apariencia toca "Instalar".
echo   La direccion de antes (http://...:5000) sigue funcionando.
echo  ============================================================
echo.
pause

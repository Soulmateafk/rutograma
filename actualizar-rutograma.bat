@echo off
chcp 65001 >nul
title Actualizar Rutograma Makand
REM ============================================================
REM  Trae la ultima version de GitHub, instala lo necesario y compila
REM  la app. Usalo cada vez que haya cambios nuevos. Tarda 1-3 minutos.
REM  Antes de usarlo, cierra la ventana de "iniciar-rutograma.bat".
REM ============================================================
cd /d "%~dp0"

echo.
echo  [1/4] Bajando los cambios de GitHub...
git pull origin main || goto error

echo.
echo  [2/4] Instalando lo del servidor...
pushd backend
call npm install || (popd & goto error)
popd

echo.
echo  [3/4] Instalando lo de la app...
pushd mi-rutograma
call npm install || (popd & goto error)

echo.
echo  [4/4] Compilando la app (puede tardar 1-2 minutos)...
call npx ng build || (popd & goto error)
popd

echo.
echo  ============================================================
echo   Listo. Ahora abre "iniciar-rutograma.bat".
echo  ============================================================
echo.
pause
exit /b 0

:error
echo.
echo  ============================================================
echo   Algo fallo. Copia lo que sale arriba y mandaselo a Claude.
echo  ============================================================
echo.
pause
exit /b 1

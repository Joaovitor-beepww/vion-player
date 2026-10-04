@echo off
title Vion Player - Servidor TV
echo ====================================================
echo   VION PLAYER - SERVIDOR PARA SMART TV
echo ====================================================
echo.
echo Para testar na sua Smart TV:
echo 1. No aplicativo DOWNLOADER (Android TV / Fire TV):
echo    Digite a URL: 192.168.1.197:3000/vion-player.apk
echo.
echo 2. No Navegador Web da TV (Samsung Tizen / LG webOS):
echo    Acesse: http://192.168.1.197:3000
echo.
echo Pressione Ctrl+C para encerrar o servidor.
echo ====================================================
echo.
node server.js
pause

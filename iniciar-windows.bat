@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e rode este arquivo de novo.
  echo Ou simplesmente abra o arquivo ABRIR-ORGANIZADOR.html com duplo clique.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias pela primeira vez...
  call npm install
)
echo Abrindo o organizador no navegador. Mantenha esta janela aberta enquanto usa.
call npm run dev

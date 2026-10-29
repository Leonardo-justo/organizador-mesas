#!/usr/bin/env bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale a versão LTS em https://nodejs.org"
  echo "Ou abra o arquivo ABRIR-ORGANIZADOR.html com duplo clique."
  exit 1
fi
[ -d node_modules ] || npm install
echo "Abrindo o organizador no navegador. Mantenha este terminal aberto enquanto usa."
npm run dev

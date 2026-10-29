# Organizador de Mesas do Casamento

Aplicação web local para distribuir os convidados nas 28 mesas (10 lugares cada, 280 no total) sobre a planta real do salão, com mapa 2D, visualização 3D, arrastar e soltar, importação de planilhas, backup e impressão.

## Como abrir

**Pelo link (mais fácil):** https://leonardo-justo.github.io/organizador-mesas/ — abre direto no Chrome, no computador ou no celular. Na primeira vez, ele pergunta se deve carregar a lista do casamento.

> Os dados ficam salvos no navegador de cada aparelho. O que você organizar no computador não aparece sozinho no celular: use Backup → Baixar e depois Restaurar no outro aparelho.


**Jeito mais simples (sem instalar nada):** dê duplo clique em `ABRIR-ORGANIZADOR.html`. Funciona no Chrome, Edge ou Firefox, inclusive sem internet.

**Pelo projeto (para quem quer alterar o código):** é preciso ter o Node.js 18 ou mais recente.

```bash
npm install
npm run dev          # abre em http://localhost:5173
```

No Windows também dá para usar `iniciar-windows.bat`; no Mac/Linux, `./iniciar-mac-linux.sh`.

> Importante: o navegador guarda os dados separadamente para cada forma de abrir. O que você organizar abrindo o `ABRIR-ORGANIZADOR.html` não aparece em `localhost:5173`, e vice-versa. Escolha uma forma e mantenha. Para levar os dados de uma para a outra, use Backup → Restaurar.

## Importar a planilha

1. Clique em **Importar convidados**.
2. Escolha o arquivo `.xlsx`, `.xls` ou `.csv`. No Google Planilhas: Arquivo → Fazer download → Microsoft Excel (.xlsx) ou CSV.
3. Confira a prévia: a coluna de nome é reconhecida automaticamente (também família/grupo, acompanhante, presença e observações). Se algo vier errado, troque a correspondência de colunas.
4. Linhas vazias são ignoradas. Linhas sem nome aparecem como erro, e as possíveis duplicatas vêm desmarcadas (marque se forem pessoas diferentes).
5. Escolha **Adicionar aos existentes** ou **Substituir todos** (esta opção pede confirmação explícita) e confirme.

Para testar, use `exemplos/convidados-exemplo.csv`, que tem 60 nomes fictícios.

## A planta

A planta original (`src/assets/planta.png`, cópia em `exemplos/planta-original.png`) já vem embutida. Os centros das 28 mesas foram medidos na própria imagem e estão em `src/data/floorplan.ts`, como coordenadas normalizadas de 0 a 1. Para isso:

- **Mover mesas** (na barra do mapa): permite arrastar as mesas para onde quiser e girar a numeração das cadeiras. As mudanças só são gravadas em "Concluir e salvar".
- **Planta** (na barra do mapa): troca a imagem caso você receba uma versão atualizada.

Convenção dos lugares: nas mesas redondas, o lugar 1 fica no topo e a numeração segue no sentido horário. Nas mesas retangulares 11 e 25, os lugares 1–4 ficam no lado de cima (da esquerda para a direita), o 5 na cabeceira direita, os lugares 6–9 embaixo e o 10 na cabeceira esquerda.

## Onde ficam os dados

Os dados ficam no **IndexedDB do navegador, neste computador** (banco `organizador-mesas-casamento`). São salvos automaticamente a cada alteração, e o indicador no topo mostra o horário do último salvamento confirmado. **Não há sincronização entre aparelhos.** Limpar os dados de navegação apaga a organização, então faça backups.

## Backup

Clique em **Backup → Baixar backup completo (.json)**. O arquivo inclui convidados, mesas, assentos, distribuição, posições do mapa, preferências e a versão do formato. Para restaurar, use **Backup → Restaurar de um arquivo**. O arquivo é validado antes, e um backup inválido nunca apaga os dados atuais.

## Exportar e imprimir

- **Exportar lista**: gera um `.xlsx` com 3 abas (por mesa, alfabética, sem lugar) ou cada lista em `.csv` (UTF-8 com `;`, que abre direto no Excel em português).
- **Imprimir mapa**: oferece A3 ou A4 em paisagem, iniciais nas cadeiras (opcional), legenda, os 10 lugares de cada mesa e lista alfabética. O ícone de impressora no painel de uma mesa imprime só aquela mesa. Para gerar PDF, escolha "Salvar como PDF".

## Atalhos

Ctrl+Z desfaz e Ctrl+Shift+Z (ou Ctrl+Y) refaz; no Mac, ⌘Z e ⌘⇧Z. Esc cancela a movimentação em andamento e fecha o painel da mesa. Ctrl + roda do mouse dá zoom no mapa.

## Testes

```bash
npm test             # testes unitários (Vitest): regras, importação, exportação, backup, IndexedDB, histórico
npx playwright install chromium   # só na primeira vez
npm run test:e2e     # testes de ponta a ponta no navegador
```

## Estrutura do código

```
src/
  data/floorplan.ts            coordenadas das mesas e dos elementos da planta
  domain/                      regras de negócio puras (seating, guests, layout, history) + testes
  state/                       estado da aplicação (zustand) e diálogos
  services/                    IndexedDB e salvamento automático
  features/import-export/      leitura de XLSX/CSV, exportação
  features/backup/             formato e validação do backup
  components/seating-map/      mapa 2D (SVG sobre a planta)
  components/three/            visualização 3D (React Three Fiber)
  components/seat-editor/      painel da mesa com os 10 lugares
  components/guest-list/       lista lateral de convidados
  components/dialogs, print/   importação, exportação, backup, impressão
e2e/                           testes Playwright
```

As regras críticas (um convidado por assento, no máximo 10 por mesa, nenhuma duplicidade) ficam centralizadas em `src/domain/seating.ts`. Cada operação devolve um estado novo validado ou um erro, e o estado anterior nunca é alterado.

Escolhas técnicas: React + TypeScript + Vite; dnd-kit para arrastar e soltar (mouse, toque e teclado); SVG para o mapa; React Three Fiber para o 3D; zustand para o estado; SheetJS para as planilhas; e fontes embutidas, para funcionar sem internet.

## Publicação (GitHub Pages)

Cada `git push` na branch `main` roda os testes e publica o site automaticamente (`.github/workflows/pages.yml`). O site é montado por `npm run build:site`, que embute `dados/lista-casamento.json` no HTML.

Para trocar a lista publicada: gere um novo backup no organizador (Backup → Baixar), substitua `dados/lista-casamento.json` por ele e faça o push.

A planilha original está em `dados/Lista_Casamento_Adultos.xlsx`, sem os telefones. O repositório é público, então os nomes dos convidados ficam visíveis para quem tiver o endereço.

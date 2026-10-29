// Monta o site publicado (GitHub Pages): o organizador em um único HTML
// com a lista do casamento embutida (o app pergunta antes de carregar).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist-arquivo/index.html', 'utf-8');
const lista = JSON.parse(readFileSync('dados/lista-casamento.json', 'utf-8'));
const tag = `<script>window.__SEED_BACKUP__=${JSON.stringify(lista).replace(/<\//g, '<\\/')};</script>`;
const out = html.replace('<head>', `<head>${tag}`);
mkdirSync('site', { recursive: true });
writeFileSync('site/index.html', out);
writeFileSync('site/.nojekyll', '');
writeFileSync('ABRIR-ORGANIZADOR.html', out);
console.log(`site/index.html pronto (${(out.length / 1024 / 1024).toFixed(1)} MB, ${lista.convidados.length} convidados)`);

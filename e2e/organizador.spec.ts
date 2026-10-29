import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SAMPLE = path.resolve('exemplos/convidados-exemplo.csv');

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explorar primeiro' }).click();
}

async function importSample(page: Page) {
  await page.locator('.lateral').getByRole('button', { name: 'Importar', exact: true }).click();
  await page.setInputFiles('[data-testid=arquivo-importacao]', SAMPLE);
  await expect(page.getByTestId('resumo-importacao')).toContainText('59 convidado(s) serão adicionados');
  await page.getByTestId('confirmar-importacao').click();
  await expect(page.getByTestId('resultado-importacao')).toContainText('59 convidado(s) importado(s)');
  await page.getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByTestId('ind-total')).toHaveText('59');
}

async function drag(page: Page, from: Locator, to: Locator) {
  await from.scrollIntoViewIfNeeded();
  await to.scrollIntoViewIfNeeded();
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + Math.min(60, a.width / 2), a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 80, a.y + a.height / 2 + 20, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(120);
}

const row = (page: Page, name: string) => page.locator(`[data-testid=linha-convidado][data-nome="${name}"]`);
const seat = (page: Page, t: number, s: number) => page.getByTestId(`assento-${t}-${s}`);

test('planta com 28 mesas nos lugares medidos', async ({ page }) => {
  await start(page);
  await expect(page.locator('g[data-testid^=mesa-]')).toHaveCount(35);
  // compara com a planta original (sem o espaçamento visual)
  await page.getByRole('button', { name: 'Mesas espaçadas' }).click();
  const svg = (await page.getByTestId('mapa-2d').boundingBox())!;
  // Mesa 16: centro medido em (139.8, 229.8) px numa planta de 1013 × 631
  const m16 = (await page.getByTestId('mesa-16').locator('circle.anel').boundingBox())!;
  const cx = ((m16.x + m16.width / 2 - svg.x) / svg.width) * 1013;
  const cy = ((m16.y + m16.height / 2 - svg.y) / svg.height) * 631;
  expect(Math.abs(cx - 139.8)).toBeLessThan(1.5);
  expect(Math.abs(cy - 229.8)).toBeLessThan(1.5);
  await page.getByTestId('mesa-5').click();
  await expect(page.getByTestId('painel-mesa')).toContainText('Mesa 5');
  await expect(page.locator('[data-testid^=assento-5-]')).toHaveCount(8);
  // espaçamento visual afasta as mesas 15 e 16 sem mudar as coordenadas salvas
  const gap = async () => {
    const a = (await page.getByTestId('mesa-16').locator('circle.anel').boundingBox())!;
    const b = (await page.getByTestId('mesa-15').locator('circle.anel').boundingBox())!;
    const s = (await page.getByTestId('mapa-2d').boundingBox())!;
    return (b.x - a.x) / s.width;
  };
  const g1 = await gap();
  await page.getByRole('button', { name: 'Espaçar mesas' }).click();
  expect(await gap()).toBeGreaterThan(g1 * 1.15);
});

test('zoom mostra os nomes dentro de cada mesa', async ({ page }) => {
  await start(page);
  await importSample(page);
  await drag(page, row(page, 'Aline Almeida'), page.getByTestId('mesa-16'));
  await drag(page, row(page, 'André Nascimento'), page.getByTestId('mesa-16'));
  const nameText = (n: string) => page.getByTestId('mesa-16').locator('text', { hasText: n });
  await expect(nameText('Aline Almeida')).toHaveCount(0);
  await page.getByTestId('ver-nomes').click();
  await expect(nameText('Aline Almeida')).toBeVisible();
  await expect(nameText('André Nascimento')).toBeVisible();
  await expect(nameText('livre')).toHaveCount(6);
  await page.screenshot({ path: 'test-results/nomes-zoom.png' });
  // ainda dá para soltar convidados nas mesas em modo nomes
  await page.getByTestId('painel-mesa').getByLabel('Fechar painel da mesa').click();
  await page.getByTestId('mesa-16').scrollIntoViewIfNeeded();
  await drag(page, row(page, 'Ana Júlia Silva'), page.getByTestId('mesa-15'));
  await expect(row(page, 'Ana Júlia Silva')).toContainText('Mesa 15 · lugar 1');
  await page.getByTestId('ver-nomes').click();
  await expect(nameText('Aline Almeida')).toHaveCount(0);
});

test('importar, arrastar, trocar, mover entre mesas, devolver à lista, desfazer/refazer', async ({ page }) => {
  await start(page);
  await importSample(page);

  // lista -> mesa no mapa (primeiro lugar livre)
  await drag(page, row(page, 'Aline Almeida'), page.getByTestId('mesa-14'));
  await expect(page.getByTestId('ind-distribuidos')).toHaveText('1');
  await expect(page.getByTestId('painel-mesa')).toContainText('Mesa 14');
  await expect(seat(page, 14, 1)).toContainText('Aline Almeida');

  // lista -> lugar exato no painel
  await drag(page, row(page, 'Aline Oliveira'), seat(page, 14, 5));
  await expect(seat(page, 14, 5)).toContainText('Aline Oliveira');

  // assento ocupado -> assento ocupado = troca automática
  await drag(page, seat(page, 14, 1), seat(page, 14, 5));
  await expect(seat(page, 14, 5)).toContainText('Aline Almeida');
  await expect(seat(page, 14, 1)).toContainText('Aline Oliveira');

  // lista -> assento ocupado = confirmação, ocupante volta para a lista
  await drag(page, row(page, 'André Nascimento'), seat(page, 14, 1));
  await expect(page.getByRole('dialog')).toContainText('Este lugar já está ocupado');
  await page.getByTestId('confirmar-substituir').click();
  await expect(seat(page, 14, 1)).toContainText('André Nascimento');
  await expect(row(page, 'Aline Oliveira')).toContainText('Sem lugar');
  await expect(page.getByTestId('ind-total')).toHaveText('59');

  // assento -> outra mesa no mapa
  await drag(page, seat(page, 14, 5), page.getByTestId('mesa-3'));
  await expect(row(page, 'Aline Almeida')).toContainText('Mesa 3 · lugar 1');

  // devolver à lista arrastando
  await page.getByTestId('mesa-3').click();
  await drag(page, seat(page, 3, 1), page.getByTestId('lista-convidados'));
  await expect(row(page, 'Aline Almeida')).toContainText('Sem lugar');
  await expect(page.getByTestId('ind-distribuidos')).toHaveText('1');

  // desfazer / refazer pelo teclado
  await page.locator('body').click({ position: { x: 5, y: 890 } });
  await page.keyboard.press('Control+z');
  await expect(row(page, 'Aline Almeida')).toContainText('Mesa 3 · lugar 1');
  await page.keyboard.press('Control+Shift+z');
  await expect(row(page, 'Aline Almeida')).toContainText('Sem lugar');
  await page.locator('.topo').getByRole('button', { name: 'Desfazer', exact: true }).click();
  await expect(row(page, 'Aline Almeida')).toContainText('Mesa 3 · lugar 1');
});

test('troca em dois toques, mesa completa e escolher quem sai da mesa lotada', async ({ page }) => {
  await start(page);
  await importSample(page);
  await page.getByRole('button', { name: 'Mover Aline Almeida' }).click();
  await expect(page.getByTestId('faixa-mover')).toContainText('Aline Almeida');
  await page.getByTestId('mesa-20').click();
  await seat(page, 20, 3).click();
  await expect(seat(page, 20, 3)).toContainText('Aline Almeida');
  await page.getByRole('button', { name: 'Mover Aline Oliveira' }).click();
  await seat(page, 20, 4).click();
  // troca: seleciona Aline Almeida e toca na Aline Oliveira
  await page.getByRole('button', { name: 'Mover ou trocar Aline Almeida' }).click();
  await seat(page, 20, 4).click();
  await expect(seat(page, 20, 4)).toContainText('Aline Almeida');
  await expect(seat(page, 20, 3)).toContainText('Aline Oliveira');

  // lote: 6 selecionados na mesa 20 (já com 2) => completa (8 lugares)
  const boxes = page.locator('[data-testid=linha-convidado] input[type=checkbox]');
  let marked = 0;
  for (let i = 0; marked < 6; i++) {
    const r = page.locator('[data-testid=linha-convidado]').nth(i);
    if ((await r.textContent())?.includes('Sem lugar')) { await boxes.nth(i).check(); marked++; }
  }
  await page.getByLabel('Mesa de destino').selectOption('20');
  await page.getByRole('button', { name: 'Distribuir' }).click();
  await expect(page.getByTestId('ocupados')).toContainText('8');
  await expect(page.getByTestId('mesa-20')).toHaveAttribute('aria-label', /8 de 8 lugares ocupados \(completa\)/);
  // mesa lotada: escolher quem sai (Tirar = volta para a lista)
  const semLugar = page.locator('[data-testid=linha-convidado]').filter({ hasText: 'Sem lugar' }).first();
  const novo = (await semLugar.getAttribute('data-nome'))!;
  await drag(page, semLugar, page.getByTestId('mesa-20'));
  await expect(page.getByRole('dialog')).toContainText('A mesa 20 está lotada');
  await expect(page.getByTestId('lista-mesa-lotada').getByRole('listitem')).toHaveCount(8);
  await page.getByRole('button', { name: 'Tirar Aline Oliveira da mesa' }).click();
  await expect(seat(page, 20, 3)).toContainText(novo);
  await expect(row(page, 'Aline Oliveira')).toContainText('Sem lugar');
  await expect(page.getByTestId('ind-distribuidos')).toHaveText('8');
  await expect(page.getByTestId('ind-total')).toHaveText('59');
  // desfazer volta exatamente ao estado anterior
  await page.locator('.topo').getByRole('button', { name: 'Desfazer', exact: true }).click();
  await expect(seat(page, 20, 3)).toContainText('Aline Oliveira');

  // mesa lotada vindo de outra mesa: Trocar leva o ocupante para o lugar antigo
  await drag(page, row(page, novo), page.getByTestId('mesa-1'));
  await expect(row(page, novo)).toContainText('Mesa 1 · lugar 1');
  await drag(page, row(page, novo), page.getByTestId('mesa-20'));
  await page.getByRole('button', { name: `Trocar ${novo} com Aline Almeida` }).click();
  await expect(row(page, novo)).toContainText('Mesa 20 · lugar 4');
  await expect(row(page, 'Aline Almeida')).toContainText('Mesa 1 · lugar 1');
  // cancelar não altera nada
  await drag(page, page.locator('[data-testid=linha-convidado]').filter({ hasText: 'Sem lugar' }).first(), page.getByTestId('mesa-20'));
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByTestId('ind-distribuidos')).toHaveText('9');
});

test('trocar a mesa inteira de uma vez', async ({ page }) => {
  await start(page);
  await importSample(page);
  await drag(page, row(page, 'Aline Almeida'), page.getByTestId('mesa-3'));
  await drag(page, row(page, 'Aline Oliveira'), page.getByTestId('mesa-3'));
  await drag(page, row(page, 'André Nascimento'), page.getByTestId('mesa-8'));
  await page.getByTestId('mesa-3').click();
  await page.getByTestId('trocar-mesa').click();
  await expect(page.getByTestId('destinos-mesa').getByRole('listitem')).toHaveCount(34);
  await page.screenshot({ path: 'test-results/trocar-mesa.png' });
  await page.getByRole('listitem', { name: 'Trocar com a mesa 8 (1 de 8)' }).click();
  await expect(row(page, 'Aline Almeida')).toContainText('Mesa 8 · lugar 1');
  await expect(row(page, 'Aline Oliveira')).toContainText('Mesa 8 · lugar 2');
  await expect(row(page, 'André Nascimento')).toContainText('Mesa 3 · lugar 1');
  await expect(page.getByTestId('painel-mesa')).toContainText('Mesa 8');
  await page.locator('.topo').getByRole('button', { name: 'Desfazer', exact: true }).click();
  await expect(row(page, 'Aline Almeida')).toContainText('Mesa 3 · lugar 1');
  await expect(row(page, 'André Nascimento')).toContainText('Mesa 8 · lugar 1');
});

test('mover mesas livremente e alargar a lista', async ({ page }) => {
  await start(page);
  const pos = async (n: number) => {
    const svg = (await page.getByTestId('mapa-2d').boundingBox())!;
    const b = (await page.getByTestId(`mesa-${n}`).locator('circle.anel').boundingBox())!;
    return { x: (b.x + b.width / 2 - svg.x) / svg.width, y: (b.y + b.height / 2 - svg.y) / svg.height, px: svg.width };
  };
  await page.getByRole('button', { name: 'Mover mesas' }).click();
  await page.getByTestId('mesa-24').click(); // seleciona antes (a faixa muda de altura)
  const a = await pos(24);
  const other = await pos(23);
  const svg = (await page.getByTestId('mapa-2d').boundingBox())!;
  const cx = svg.x + a.x * svg.width, cy = svg.y + a.y * svg.height;
  await page.mouse.move(cx + 3, cy + 3);
  await page.mouse.down();
  await page.mouse.move(cx - 37, cy + 63, { steps: 8 });
  await page.mouse.up();
  const b = await pos(24);
  expect((b.x - a.x) * a.px).toBeCloseTo(-40, -1);
  expect((b.y - a.y) * a.px * (631 / 1013)).toBeCloseTo(60, -1);
  const other2 = await pos(23);
  expect(Math.abs(other2.x - other.x)).toBeLessThan(0.001); // as outras mesas não se mexem
  await page.getByTestId('concluir-calibracao').click();
  await page.waitForTimeout(500);
  await page.reload();
  const c = await pos(24);
  expect(Math.abs(c.x - b.x)).toBeLessThan(0.003);
  expect(Math.abs(c.y - b.y)).toBeLessThan(0.003);

  // lista de convidados mais larga, ajustável pela borda
  const lista = (await page.locator('.lateral').boundingBox())!;
  expect(lista.width).toBeGreaterThanOrEqual(415);
  const h = (await page.getByTestId('alca-lista').boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + 200);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 120, h.y + 200, { steps: 5 });
  await page.mouse.up();
  const lista2 = (await page.locator('.lateral').boundingBox())!;
  expect(lista2.width).toBeGreaterThan(lista.width + 100);
  await page.reload();
  expect((await page.locator('.lateral').boundingBox())!.width).toBeGreaterThan(lista.width + 100);
});

test('tela Mesas em lista: adicionar em sequência sem usar o mapa', async ({ page }) => {
  await start(page);
  await importSample(page);
  await page.getByTestId('modo-lista').click();
  await expect(page.getByTestId('tela-lista')).toBeVisible();
  await expect(page.locator('section[data-testid^=lv-mesa-]')).toHaveCount(35);
  const busca = page.getByTestId('lv-busca');
  // convidado existente
  await busca.fill('aline alm');
  await busca.press('Enter');
  await expect(page.getByTestId('lv-1-1')).toContainText('Aline Almeida');
  // novo convidado digitado na hora
  await busca.fill('Tia Zuleica');
  await busca.press('Enter');
  await expect(page.getByTestId('lv-1-2')).toContainText('Tia Zuleica');
  await expect(page.getByTestId('ind-total')).toHaveText('60');
  // escolher outra mesa para começar
  await page.getByTestId('lv-mesa-alvo').selectOption('5');
  await busca.fill('André Nasc');
  await busca.press('Enter');
  await expect(page.getByTestId('lv-5-1')).toContainText('André Nascimento');
  // colocar todos os confirmados em sequência a partir da mesa 5
  await page.getByTestId('lv-colocar-todos').click();
  await page.getByTestId('confirmar').click();
  await expect(page.getByTestId('lv-mesa-5')).toContainText('8/8');
  await expect(page.getByTestId('ind-sem-lugar')).toHaveText('24');
  // arrastar entre cartões continua funcionando
  await drag(page, page.getByTestId('lv-1-1'), page.getByTestId('lv-2-4'));
  await expect(page.getByTestId('lv-2-4')).toContainText('Aline Almeida');
  // tirar todos das mesas
  await page.getByTestId('lv-tirar-todos').click();
  await page.getByTestId('confirmar').click();
  await expect(page.getByTestId('ind-distribuidos')).toHaveText('0');
  await expect(page.getByTestId('ind-total')).toHaveText('60');
  await page.screenshot({ path: 'test-results/tela-lista.png' });
  await page.locator('.topo').getByRole('button', { name: 'Desfazer', exact: true }).click();
  await expect(page.getByTestId('ind-distribuidos')).toHaveText('36');
});

test('importar já colocando os confirmados nas mesas', async ({ page }) => {
  await start(page);
  await page.locator('.lateral').getByRole('button', { name: 'Importar', exact: true }).click();
  await page.setInputFiles('[data-testid=arquivo-importacao]', SAMPLE);
  await page.getByTestId('importar-em-sequencia').check();
  await page.getByTestId('confirmar-importacao').click();
  await expect(page.getByTestId('resultado-importacao')).toContainText('35 confirmado(s) colocados nas mesas');
  await page.getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByTestId('ind-distribuidos')).toHaveText('35');
  await expect(page.getByTestId('mesa-4')).toHaveAttribute('aria-label', /8 de 8/);
  await expect(page.getByTestId('mesa-5')).toHaveAttribute('aria-label', /3 de 8/);
});

test('adicionar, remover e mudar lugares de mesas', async ({ page }) => {
  await start(page);
  await importSample(page);
  await drag(page, row(page, 'Aline Almeida'), page.getByTestId('mesa-35'));
  await page.getByRole('button', { name: 'Mover mesas' }).click();
  await page.getByTestId('add-mesa-redonda').click();
  await page.getByTestId('add-mesa-ret').click();
  await expect(page.locator('g[data-testid^=mesa-]')).toHaveCount(37);
  // mesa 37 (retangular) selecionada: 10 lugares
  await expect(page.getByTestId('mesa-selecionada')).toContainText('Mesa 37');
  await page.getByRole('button', { name: 'Mais um lugar' }).click();
  await page.getByRole('button', { name: 'Mais um lugar' }).click();
  await expect(page.getByTestId('lugares-mesa')).toHaveText('10');
  // remover a mesa 35 (tem 1 convidado): pede confirmação
  await page.getByTestId('mesa-35').click();
  await page.getByTestId('remover-mesa').click();
  await page.getByTestId('confirmar').click();
  await expect(page.getByTestId('faixa-calibrar')).toContainText('1 convidado(s) de lugares removidos voltam para a lista');
  await page.getByTestId('concluir-calibracao').click();
  await expect(page.locator('g[data-testid^=mesa-]')).toHaveCount(36);
  await expect(row(page, 'Aline Almeida')).toContainText('Sem lugar');
  await expect(page.getByTestId('ind-total')).toHaveText('59');
  await expect(page.getByTestId('ind-livres')).toContainText('290'); // 34×8 + 8 + 10
  // a mesa nova recebe convidados
  await page.getByTestId('mesa-37').scrollIntoViewIfNeeded();
  await drag(page, row(page, 'Aline Almeida'), page.getByTestId('mesa-37'));
  await expect(page.locator('[data-testid^=assento-37-]')).toHaveCount(10);
  await expect(page.getByTestId('assento-37-1')).toContainText('Aline Almeida');
  await expect(page.getByTestId('salvamento')).toContainText('Salvo em');
  await page.reload();
  await expect(page.locator('g[data-testid^=mesa-]')).toHaveCount(36);
  await expect(row(page, 'Aline Almeida')).toContainText('Mesa 37 · lugar 1');
});

test('dados antigos (28 mesas de 10) são convertidos para 35 de 8 sem perder ninguém', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const guests: Record<string, unknown> = {};
    const assignments: Record<string, string> = {};
    for (let i = 0; i < 30; i++) {
      const id = `g${i}`;
      guests[id] = { id, fullName: `Convidado ${String(i).padStart(2, '0')}`, rsvp: 'confirmado', createdAt: new Date(1e12 + i).toISOString() };
      assignments[`${Math.floor(i / 10) + 1}-${(i % 10) + 1}`] = id;
    }
    const tables = Array.from({ length: 28 }, (_, i) => ({ number: i + 1, shape: i === 10 || i === 24 ? 'rect' : 'round', x: 0.1 + (i % 7) * 0.1, y: 0.2 + Math.floor(i / 7) * 0.15, seatRotation: 0 }));
    const rec = { seating: { guests, assignments }, layout: { tables }, prefs: { mode: '2d', zoom: 1, spacing: 1.22, showNamesOnPrint: true, paper: 'A3', tipsDismissed: ['boas-vindas'] }, schemaVersion: 1, savedAt: new Date().toISOString() };
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('organizador-mesas-casamento', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('estado');
      req.onsuccess = () => { const tx = req.result.transaction('estado', 'readwrite'); tx.objectStore('estado').put(rec, 'atual'); tx.oncomplete = () => { req.result.close(); res(); }; tx.onerror = () => rej(tx.error); };
    });
  });
  await page.reload();
  await expect(page.getByRole('dialog')).toContainText('Novo salão: 35 mesas de 8 lugares');
  await page.getByTestId('upgrade-redistribuir').click();
  await expect(page.locator('g[data-testid^=mesa-]')).toHaveCount(35);
  await expect(page.getByTestId('ind-distribuidos')).toHaveText('30');
  await expect(row(page, 'Convidado 08')).toContainText('Mesa 2 · lugar 1');
  await expect(page.getByTestId('mesa-4')).toHaveAttribute('aria-label', /6 de 8/);
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('g[data-testid^=mesa-]')).toHaveCount(35);
});

test('busca localiza convidado; dados e calibração persistem após recarregar', async ({ page }) => {
  await start(page);
  await importSample(page);
  await drag(page, row(page, 'Ana Júlia Silva'), page.getByTestId('mesa-9'));
  await page.getByTestId('painel-mesa').getByLabel('Fechar painel da mesa').click();
  await page.getByLabel('Buscar convidado').fill('ana julia sil');
  await page.getByRole('option', { name: /Ana Júlia Silva/ }).click();
  await expect(page.getByTestId('painel-mesa')).toContainText('Mesa 9');
  await expect(seat(page, 9, 1)).toHaveClass(/destaque/);
  await expect(page.getByTestId('ficha-lugar')).toContainText('Ana Júlia Silva');

  // calibração: arrastar a mesa 1 e salvar
  await page.getByRole('button', { name: 'Mover mesas' }).click();
  await expect(page.getByTestId('faixa-calibrar')).toBeVisible();
  const m1 = (await page.getByTestId('mesa-1').boundingBox())!;
  await page.mouse.move(m1.x + m1.width / 2, m1.y + m1.height / 2);
  await page.mouse.down();
  await page.mouse.move(m1.x + m1.width / 2 + 40, m1.y + m1.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  await page.getByTestId('concluir-calibracao').click();
  const norm = async () => {
    const svg = (await page.getByTestId('mapa-2d').boundingBox())!;
    const b = (await page.getByTestId('mesa-1').locator('circle.anel').boundingBox())!;
    return { x: (b.x + b.width / 2 - svg.x) / svg.width, y: (b.y + b.height / 2 - svg.y) / svg.height };
  };
  const after = await norm();
  expect(after.x).toBeGreaterThan(0.693 + 0.02); // posição original da mesa 1: x = 0,693

  await expect(page.getByTestId('salvamento')).toContainText('Salvo em');
  await page.reload();
  await expect(page.getByTestId('ind-total')).toHaveText('59');
  await expect(row(page, 'Ana Júlia Silva')).toContainText('Mesa 9 · lugar 1');
  const reloaded = await norm();
  expect(Math.abs(reloaded.x - after.x)).toBeLessThan(0.002);
  expect(Math.abs(reloaded.y - after.y)).toBeLessThan(0.002);
});

test('2D e 3D compartilham seleção e distribuição', async ({ page }) => {
  await start(page);
  await importSample(page);
  await drag(page, row(page, 'Aline Almeida'), page.getByTestId('mesa-7'));
  await page.getByTestId('mesa-12').click();
  await page.getByTestId('alternar-modo').click();
  await expect(page.getByTestId('cena-3d').locator('canvas')).toBeVisible();
  await expect(page.locator('.rotulo3d')).toContainText('Mesa 12');
  await expect(page.getByTestId('painel-mesa')).toContainText('Mesa 12');
  await page.waitForFunction(() => typeof (window as unknown as { __mesa3d?: unknown }).__mesa3d === 'function');
  await page.waitForTimeout(500);
  const p = await page.evaluate(() => (window as unknown as { __mesa3d: (n: number) => { x: number; y: number } }).__mesa3d(7));
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('painel-mesa')).toContainText('Mesa 7');
  await expect(seat(page, 7, 1)).toContainText('Aline Almeida');
  await page.screenshot({ path: 'test-results/tela-3d.png' });
  await page.getByTestId('alternar-modo').click();
  await expect(page.getByTestId('mesa-7')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('mesa-7')).toHaveAttribute('aria-label', /1 de 8/);
});

test('exportação, backup e restauração', async ({ page }) => {
  await start(page);
  await importSample(page);
  await drag(page, row(page, 'Aline Almeida'), page.getByTestId('mesa-2'));
  await page.getByRole('button', { name: 'Exportar lista' }).click();
  const [csvDl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('exportar-csv-por-mesa').click()]);
  const csv = readFileSync((await csvDl.path())!, 'utf-8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain('2;1;Aline Almeida;Família Almeida');
  expect(csv.trim().split('\r\n')).toHaveLength(281);
  const [xDl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('exportar-xlsx').click()]);
  expect((await xDl.suggestedFilename())).toMatch(/\.xlsx$/);
  await page.getByRole('button', { name: 'Fechar' }).last().click();

  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  const [bDl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('baixar-backup').click()]);
  const backupPath = (await bDl.path())!;
  const json = JSON.parse(readFileSync(backupPath, 'utf-8'));
  expect(json.versao).toBe(1);
  expect(json.convidados).toHaveLength(59);
  expect(json.mesas).toHaveLength(35);
  await page.getByRole('button', { name: 'Fechar' }).last().click();

  // altera tudo: exclui a pessoa sentada
  await page.getByRole('button', { name: 'Editar Aline Almeida' }).click();
  await page.getByRole('button', { name: 'Excluir cadastro' }).click();
  await expect(page.getByRole('dialog')).toContainText('lugar ficará livre');
  await page.getByTestId('confirmar').click();
  await expect(page.getByTestId('ind-total')).toHaveText('58');

  // backup inválido não altera nada
  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  await page.setInputFiles('[data-testid=arquivo-backup]', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"formato":"outro"}') });
  await expect(page.getByRole('alert')).toContainText('seus dados atuais não foram alterados');
  await expect(page.getByTestId('ind-total')).toHaveText('58');
  // backup válido restaura
  await page.setInputFiles('[data-testid=arquivo-backup]', backupPath);
  await page.getByTestId('confirmar').click();
  await expect(page.getByTestId('ind-total')).toHaveText('59');
  await expect(row(page, 'Aline Almeida')).toContainText('Mesa 2 · lugar 1');
});

test('impressão gera mapa com legenda e listas por mesa', async ({ page }) => {
  await start(page);
  await importSample(page);
  await drag(page, row(page, 'Aline Almeida'), page.getByTestId('mesa-28'));
  await page.getByRole('button', { name: 'Imprimir mapa' }).click();
  await page.evaluate(() => { window.print = () => undefined; });
  await page.getByTestId('imprimir').click();
  const imp = page.locator('#impressao');
  await expect(imp).toContainText('Mapa das mesas');
  await expect(imp).toContainText('Completa (todos os lugares ocupados)');
  await expect(imp.locator('.imp-mesa')).toHaveCount(35);
  await expect(imp).toContainText('Aline Almeida');
  await page.emulateMedia({ media: 'print' });
  await page.screenshot({ path: 'test-results/impressao.png', fullPage: true });
});

test('celular: lista vira gaveta e mover por toques funciona', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await start(page);
  await page.getByRole('button', { name: 'Convidados', exact: true }).click();
  await importSample(page);
  await page.getByRole('button', { name: 'Mover Aline Almeida' }).click();
  await expect(page.locator('.lateral')).not.toHaveClass(/aberta/);
  await page.getByTestId('mesa-6').tap();
  await seat(page, 6, 2).tap();
  await expect(seat(page, 6, 2)).toContainText('Aline Almeida');
  await page.screenshot({ path: 'test-results/celular.png' });
  await ctx.close();
});

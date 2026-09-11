import { chromium, webkit } from 'playwright';
import { createServer } from './serve-demo.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'test-results');
await fs.mkdir(output, { recursive: true });
const results = [];
for (const [name, type] of [['chromium', chromium], ['webkit', webkit]]) {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://localhost:${server.address().port}/`;
  const profile = await fs.mkdtemp(path.join(output, `restart-${name}-`));
  const options = { headless: true, viewport: { width: 402, height: 874 }, ...(name === 'chromium' && process.env.POCKET_TEST_CHROMIUM ? { executablePath: process.env.POCKET_TEST_CHROMIUM } : {}) };
  let context;
  try {
    context = await type.launchPersistentContext(profile, options);
    let page = context.pages()[0];
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('#offline-status').textContent.startsWith('Ready offline'));
    await page.locator('#files').setInputFiles(path.join(root, 'demo/icon-512.png'));
    await page.waitForFunction(() => document.querySelectorAll('.card-button').length === 3);
    await context.close(); context = null;
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    context = await type.launchPersistentContext(profile, { ...options, ...(name === 'chromium' ? { offline: true } : {}) });
    page = context.pages()[0];
    await page.goto(url, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelectorAll('.card-button').length === 3, null, { timeout: 10000 });
    await page.locator('.card-button').last().click();
    await page.waitForFunction(() => document.querySelector('#focused-card img')?.naturalWidth > 0);
    results.push({ browser: name, result: 'PASS', method: 'full browser process closed and reopened after origin server stopped', importedImageRestored: true });
  } catch (error) {
    results.push({ browser: name, result: 'FAIL', error: error.message }); process.exitCode = 1;
  } finally {
    if (context) await context.close();
    server.closeAllConnections(); server.close();
  }
}
await fs.writeFile(path.join(output, 'offline-restart.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

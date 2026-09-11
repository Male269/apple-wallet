import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { createServer } from './serve-demo.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'test-results');
await fs.mkdir(output, { recursive: true });
const results = [];
const stopServer = server => new Promise(resolve => {
  server.close(resolve);
  // Browsers can hold unused speculative TCP connections open indefinitely.
  server.closeAllConnections();
});
async function until(page, expression) { await page.waitForFunction(expression, null, { timeout: 10000 }); }
async function test(browserType, label) {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://localhost:${server.address().port}/`;
  const browser = await browserType.launch({ headless: true, ...(label === 'chromium' && process.env.POCKET_TEST_CHROMIUM ? { executablePath: process.env.POCKET_TEST_CHROMIUM } : {}) });
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: 'dark' });
  const errors = [], external = [], requests = [];
  context.on('request', request => { requests.push(request.method()); if (!request.url().startsWith(url) && !/^(blob:|data:)/.test(request.url())) external.push(request.url()); });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(10000);
  try {
    await page.goto(url);
    await until(page, () => document.querySelectorAll('.card-button').length === 2);
    await until(page, () => document.querySelector('#offline-status').textContent.startsWith('Ready offline'));
    await page.screenshot({ path: path.join(output, `${label}-home-dark.png`), fullPage: true });
    await page.locator('.card-button').first().click();
    await page.locator('#viewer[open]').waitFor();
    await page.locator('#focused-card').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
    assert.match(await page.locator('.demo-footer').textContent(), /NOT VALID FOR ENTRY/);
    await page.screenshot({ path: path.join(output, `${label}-viewer.png`) });
    const cdp = label === 'chromium' ? await context.newCDPSession(page) : null;
    async function gesture(dx, dy, cancel = false) {
      const box = await page.locator('#focused-card').boundingBox();
      const x = box.x + box.width / 2, y = box.y + 65;
      if (cdp) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let step = 1; step <= 10; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 10, y: y + dy * step / 10 }] });
        // A held short pull should settle, irrespective of an initially quick movement.
        if (Math.abs(dy) < 120) await page.waitForTimeout(110);
        await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
      } else {
        await page.mouse.move(x, y); await page.mouse.down();
        await page.mouse.move(x + dx, y + dy, { steps: 10 });
        if (Math.abs(dy) < 120) await page.waitForTimeout(110);
        if (cancel) await page.locator('#focused-card').dispatchEvent('pointercancel', { pointerId: 1 });
        await page.mouse.up();
      }
    }
    await gesture(0, 40);
    assert.equal(await page.locator('#viewer').evaluate(el => el.open), true, 'Short drag stays open');
    await page.locator('#focused-card').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
    await gesture(-130, 0);
    await until(page, () => document.querySelector('#position').textContent === '2 / 2');
    await page.locator('#focused-card').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
    if (cdp) {
      await gesture(0, 80, true);
      assert.equal(await page.locator('#viewer').evaluate(el => el.open), true, 'Cancelled touch stays open');
      await page.locator('#focused-card').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
    }
    await gesture(0, 170);
    await until(page, () => !document.querySelector('#viewer').open);
    await page.locator('#files').setInputFiles(path.join(root, 'demo/icon-512.png'));
    await until(page, () => document.querySelectorAll('.card-button').length === 3);
    await page.locator('.card-button').last().click();
    await page.locator('#details').click();
    await page.locator('#image-title').fill('My saved image'); await page.locator('#save-title').click();
    await page.locator('#details').click(); await page.locator('#fit').click();
    await until(page, () => document.querySelector('#fit').textContent.endsWith('Fill'));
    await page.locator('[data-close="options"]').click(); await page.locator('#close-viewer').click();
    await page.locator('#theme').click();
    await until(page, () => document.documentElement.dataset.theme === 'light');
    await page.reload();
    await until(page, () => document.querySelectorAll('.card-button').length === 3);
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.getByRole('button', { name: 'Open My saved image, demo image', exact: true }).click();
    assert.equal(await page.locator('#focused-card .art').evaluate(el => el.classList.contains('cover')), true);
    await until(page, () => document.querySelector('#focused-card img')?.naturalWidth > 0);
    await page.locator('#details').click(); await page.locator('#remove').click();
    await until(page, () => document.querySelectorAll('.card-button').length === 2);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await until(page, () => document.querySelectorAll('.card-button').length === 3);
    await page.locator('#files').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('invalid image') });
    await until(page, () => document.querySelector('#notice').textContent.includes('skipped'));
    assert.equal(await page.locator('.card-button').count(), 3);
    await page.screenshot({ path: path.join(output, `${label}-home-light.png`), fullPage: true });
    // Stop the origin itself: responses must come from the installed cache.
    // WebKit's Windows setOffline adapter aborts service-worker navigations.
    await stopServer(server);
    if (label === 'chromium') await context.setOffline(true);
    await page.reload();
    await until(page, () => document.querySelectorAll('.card-button').length === 3);
    await page.getByRole('button', { name: 'Open My saved image, demo image', exact: true }).click();
    await until(page, () => document.querySelector('#focused-card img')?.naturalWidth > 0);
    await page.screenshot({ path: path.join(output, `${label}-offline-image.png`) });
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(url + '?launch=homescreen');
    await until(reopened, () => document.querySelectorAll('.card-button').length === 3);
    for (const size of [{ width: 320, height: 568 }, { width: 874, height: 402 }]) {
      await reopened.setViewportSize(size);
      assert.equal(await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal overflow');
      await reopened.locator('.card-button').first().click();
      await reopened.locator('#close-viewer').click();
    }
    await reopened.emulateMedia({ reducedMotion: 'reduce' });
    await reopened.locator('.card-button').first().click();
    await reopened.keyboard.press('Escape');
    assert.equal(await reopened.locator('#viewer').evaluate(el => el.open), false);
    for (let i = 0; i < 3; i++) {
      await reopened.locator('.card-button').first().click();
      await reopened.locator('#details').click(); await reopened.locator('#remove').click();
    }
    await reopened.reload();
    await reopened.locator('.empty').waitFor();
    assert.equal(await reopened.locator('.card-button').count(), 0, 'Deleted sample cards do not return');
    assert.deepEqual(errors, [], 'No JavaScript errors');
    assert.deepEqual(external, [], 'No external requests');
    assert.equal(requests.every(method => method === 'GET'), true, 'No image upload requests');
    results.push({ browser: label, version: browser.version(), result: 'PASS', touch: !!cdp, offlineMethod: label === 'chromium' ? 'origin stopped and browser offline' : 'origin stopped', checks: ['import', 'rename', 'fit', 'theme', 'reload persistence', 'short pull', 'sideways swipe', 'long pull', 'remove and undo', 'invalid image', 'offline reload', 'offline window reopen', '320px and landscape layouts', 'reduced motion', 'empty collection persistence', 'no external requests'] });
  } catch (error) {
    const activePage = context.pages().at(-1);
    if (activePage) {
      await activePage.screenshot({ path: path.join(output, `${label}-failure.png`) }).catch(() => {});
      console.error(label, await activePage.evaluate(() => ({ viewerOpen: document.querySelector('#viewer')?.open, position: document.querySelector('#position')?.textContent, notice: document.querySelector('#notice')?.textContent })).catch(() => null), errors);
    }
    throw error;
  } finally { await context.close(); await browser.close(); await stopServer(server); }
}
try {
  await test(chromium, 'chromium');
  await test(webkit, 'webkit');
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  results.push({ result: 'FAIL', error: error.stack });
  console.error(error); process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
}

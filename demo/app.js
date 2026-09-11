'use strict';
const $ = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const DB_NAME = 'pocket-demo-v1';
let db, cards = [], selected = -1, noticeTimer, drag, spring;
const urls = new Map();
let theme = 'auto';

function notice(message, undo) {
  clearTimeout(noticeTimer);
  const host = [...document.querySelectorAll('dialog[open]')].at(-1) || document.body;
  host.append($('notice'));
  $('notice').replaceChildren(document.createTextNode(message));
  if (undo) {
    const button = document.createElement('button');
    button.textContent = 'Undo';
    button.onclick = async () => { button.disabled = true; try { await undo(); $('notice').hidden = true; } catch { notice('Could not restore the image. Please try importing it again.'); } };
    $('notice').append(button);
  }
  $('notice').hidden = false;
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, undo ? 10000 : 7000);
}
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('cards', { keyPath: 'id' });
      request.result.createObjectStore('settings');
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other Pocket Demo windows and try again.'));
  });
}
function transaction(store, mode, action) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Device storage is unavailable.'));
    const tx = db.transaction(store, mode);
    const request = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Could not save changes.'));
  });
}
const save = card => transaction('cards', 'readwrite', store => store.put(card));
function setTheme(value) {
  theme = value;
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  $('theme').textContent = 'Theme: ' + theme[0].toUpperCase() + theme.slice(1);
  const light = theme === 'light' || (theme === 'auto' && matchMedia('(prefers-color-scheme: light)').matches);
  document.querySelector('meta[name="theme-color"]').content = light ? '#f4f1f8' : '#14131a';
}
function cardElement(card) {
  const element = document.createElement('div'); element.className = 'card';
  const art = document.createElement('div'); art.className = 'art ' + (card.fit || 'contain');
  if (card.image) {
    if (!urls.has(card.id)) urls.set(card.id, URL.createObjectURL(new Blob([card.image], { type: 'image/jpeg' })));
    const img = new Image(); img.src = urls.get(card.id); img.alt = card.title; img.draggable = false; art.append(img);
  } else {
    const sample = document.createElement('div'); sample.className = 'sample ' + card.sample;
    const word = document.createElement('span'); word.className = 'sample-word'; word.textContent = card.sample === 'garden' ? 'grow.' : 'wander.';
    sample.append(word); art.append(sample);
  }
  const watermark = document.createElement('div'); watermark.className = 'watermark'; watermark.textContent = 'DEMO · NOT VALID FOR ENTRY'; art.append(watermark);
  const label = document.createElement('div'); label.className = 'card-label';
  const title = document.createElement('span'); title.className = 'card-title'; title.textContent = card.title;
  const detail = document.createElement('small'); detail.textContent = card.image ? 'YOUR IMAGE ↗' : 'SAMPLE ↗';
  label.append(title, detail); element.append(art, label); return element;
}
function render() {
  $('collection').replaceChildren();
  cards.forEach((card, i) => {
    const button = document.createElement('button'); button.className = 'card-button'; button.dataset.id = card.id;
    button.setAttribute('aria-label', 'Open ' + card.title + ', demo image'); button.append(cardElement(card));
    button.onclick = () => openViewer(i); $('collection').append(button);
  });
  if (!cards.length) {
    const empty = document.createElement('div'); empty.className = 'empty';
    empty.textContent = 'A fresh pocket. Tap + to add an image.'; $('collection').append(empty);
  }
  $('count').textContent = `YOUR COLLECTION · ${cards.length}`;
}
function animate(element, frames, options = {}) {
  return element.animate(frames, { duration: reducedMotion.matches ? 0 : 300, easing: 'cubic-bezier(.2,.8,.2,1)', ...options });
}
function showSelected() {
  if (!cards[selected]) return closeViewer();
  drag = null; spring?.cancel(); $('focused-card').style.transform = '';
  $('focused-card').replaceChildren(cardElement(cards[selected]));
  $('position').textContent = `${selected + 1} / ${cards.length}`;
  $('previous').disabled = selected === 0; $('next').disabled = selected === cards.length - 1;
  $('viewer-scroll').scrollTop = 0;
}
function openViewer(index) {
  selected = index; showSelected(); $('viewer').showModal();
  animate($('focused-card'), [{ transform: 'translateY(50px) scale(.96)', opacity: .4 }, { transform: 'none', opacity: 1 }]);
}
function closeViewer() {
  const id = cards[selected]?.id;
  drag = null; spring?.cancel(); $('focused-card').style.transform = ''; $('viewer').close();
  if ($('viewer').contains($('notice'))) { $('notice').hidden = true; document.body.append($('notice')); }
  // Preserve keyboard position after gestures, even when focus was inside a sheet.
  [...$('collection').children].find(el => el.dataset.id === id)?.focus({ preventScroll: true });
}
function navigate(delta) {
  const next = selected + delta;
  if (next < 0 || next >= cards.length) return;
  selected = next; showSelected();
  animate($('focused-card'), [{ transform: `translateX(${delta * 45}px)`, opacity: .5 }, { transform: 'none', opacity: 1 }]);
}
$('focused-card').addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || drag) return;
  spring?.cancel();
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, lastY: event.clientY, lastTime: event.timeStamp, dy: 0, dx: 0, velocity: 0, axis: null };
  $('focused-card').setPointerCapture(event.pointerId);
});
$('focused-card').addEventListener('pointermove', event => {
  if (!drag || drag.id !== event.pointerId) return;
  drag.dx = event.clientX - drag.x; drag.dy = event.clientY - drag.y;
  if (!drag.axis && Math.hypot(drag.dx, drag.dy) > 8) drag.axis = Math.abs(drag.dx) > Math.abs(drag.dy) ? 'x' : 'y';
  const elapsed = event.timeStamp - drag.lastTime;
  if (elapsed > 0) drag.velocity = (event.clientY - drag.lastY) / elapsed;
  drag.lastY = event.clientY; drag.lastTime = event.timeStamp;
  const x = drag.axis === 'x' ? drag.dx * .75 : 0;
  const y = drag.axis === 'y' ? (drag.dy > 0 ? drag.dy : drag.dy * .18) : 0;
  $('focused-card').style.transform = `translate(${x}px,${y}px) rotate(${x * .012}deg)`;
});
function release(event, cancelled = false) {
  if (!drag || drag.id !== event.pointerId) return;
  const finished = drag; drag = null;
  if ($('focused-card').hasPointerCapture(event.pointerId)) $('focused-card').releasePointerCapture(event.pointerId);
  const freshVelocity = event.timeStamp - finished.lastTime < 90 ? finished.velocity : 0;
  if (!cancelled && finished.axis === 'y' && (finished.dy > 120 || (finished.dy > 35 && freshVelocity > .7))) return closeViewer();
  if (!cancelled && finished.axis === 'x' && Math.abs(finished.dx) > 65) {
    const delta = finished.dx < 0 ? 1 : -1;
    if (selected + delta >= 0 && selected + delta < cards.length) return navigate(delta);
  }
  const from = $('focused-card').style.transform;
  $('focused-card').style.transform = '';
  spring = animate($('focused-card'), [{ transform: from }, { transform: 'translateY(-4px)', offset: .72 }, { transform: 'none' }], { duration: reducedMotion.matches ? 0 : 360 });
}
$('focused-card').addEventListener('pointerup', event => release(event));
$('focused-card').addEventListener('pointercancel', event => release(event, true));
$('focused-card').addEventListener('lostpointercapture', event => release(event, true));
$('viewer').addEventListener('keydown', event => {
  if ($('options').open) return;
  if (event.key === 'ArrowLeft') { event.preventDefault(); navigate(-1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); navigate(1); }
});
$('viewer').addEventListener('cancel', event => { event.preventDefault(); closeViewer(); });
$('close-viewer').onclick = closeViewer;
$('previous').onclick = () => navigate(-1); $('next').onclick = () => navigate(1);
$('help').onclick = () => $('help-dialog').showModal();
document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => $(button.dataset.close).close(); });
$('details').onclick = () => {
  $('image-title').value = cards[selected].title;
  $('fit').textContent = 'Image fit: ' + (cards[selected].fit === 'cover' ? 'Fill' : 'Contain');
  $('options').showModal();
};
async function updateSelected(patch) {
  const updated = { ...cards[selected], ...patch };
  await save(updated); cards[selected] = updated; render(); showSelected();
}
$('save-title').onclick = async () => {
  const title = $('image-title').value.trim();
  if (!title) return notice('Give this image a name first.');
  try { await updateSelected({ title }); $('options').close(); } catch { notice('Could not save the name. Device storage may be full.'); }
};
$('fit').onclick = async () => {
  try { await updateSelected({ fit: cards[selected].fit === 'cover' ? 'contain' : 'cover' }); $('fit').textContent = 'Image fit: ' + (cards[selected].fit === 'cover' ? 'Fill' : 'Contain'); } catch { notice('Could not save the image fit.'); }
};
$('remove').onclick = async () => {
  const index = selected, card = cards[index];
  try {
    await transaction('cards', 'readwrite', store => store.delete(card.id));
    $('options').close(); closeViewer(); cards.splice(index, 1); render();
    if (urls.has(card.id)) { URL.revokeObjectURL(urls.get(card.id)); urls.delete(card.id); }
    notice('Image removed from this device.', async () => { await save(card); cards.splice(Math.min(index, cards.length), 0, card); render(); });
  } catch { notice('Could not remove the image.'); }
};
$('theme').onclick = async () => {
  setTheme(['auto', 'light', 'dark'][(['auto', 'light', 'dark'].indexOf(theme) + 1) % 3]);
  try { await transaction('settings', 'readwrite', store => store.put(theme, 'theme')); } catch { notice('Theme changed for this visit; it could not be saved.'); }
};
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => setTheme(theme));

async function importImage(file) {
  if (file.size > 25 * 1024 * 1024) throw new Error('Images must be under 25 MB.');
  if (file.type === 'image/svg+xml' || (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|heic|heif|gif|avif)$/i.test(file.name))) throw new Error('Choose a PNG, JPEG, WebP, or another supported photo.');
  const source = URL.createObjectURL(file), img = new Image();
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Image decoding timed out. Try a smaller image.')), 20000);
      img.onload = () => { clearTimeout(timer); resolve(); };
      img.onerror = () => { clearTimeout(timer); reject(new Error('This image could not be opened. Try JPEG or PNG.')); };
      img.src = source;
    });
    if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 60000000) throw new Error('Image is too large. Choose a smaller copy.');
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f3f0fa'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Store a visibly labeled copy as well as the always-visible UI label.
    const fontSize = Math.min(canvas.width / 24, canvas.height / 5), band = fontSize * 2.4;
    ctx.fillStyle = 'rgba(32,22,45,.90)'; ctx.fillRect(0, canvas.height * .47, canvas.width, band);
    ctx.fillStyle = '#ffffff'; ctx.font = `700 ${fontSize}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('DEMO · NOT VALID FOR ENTRY', canvas.width / 2, canvas.height * .47 + band / 2, canvas.width * .95);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .88));
    if (!blob) throw new Error('Could not prepare this image.');
    // ArrayBuffers avoid Blob persistence failures in some WebKit data stores.
    return { id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, '').slice(0, 64) || 'My image', image: await blob.arrayBuffer(), fit: 'contain', created: Date.now() };
  } finally { URL.revokeObjectURL(source); }
}
$('add').onclick = () => $('files').click();
$('files').onchange = async () => {
  const files = [...$('files').files]; $('files').value = '';
  if (!files.length) return;
  if (!db) return notice('Device storage is unavailable. Close Private Browsing or free some space, then reopen the app.');
  if (files.length > 20 || cards.length + files.length > 60) return notice('Import up to 20 images at once, with 60 cards in total.');
  $('add').disabled = true;
  let imported = 0; const errors = [];
  for (const file of files) {
    notice(`Adding image ${imported + errors.length + 1} of ${files.length}…`);
    try { const card = await importImage(file); await save(card); cards.push(card); imported++; }
    catch (error) { errors.push(error.name === 'QuotaExceededError' ? 'Device storage is full.' : error.message); }
  }
  render(); $('add').disabled = false;
  notice(`${imported} image${imported === 1 ? '' : 's'} saved on this device.${errors.length ? ' ' + errors.length + ' skipped. ' + errors[0] : ''}`);
};

async function prepareOffline() {
  const status = $('offline-status');
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    status.textContent = 'Open the HTTPS site to enable offline use'; return;
  }
  let ready = false;
  const update = () => { status.textContent = ready ? (navigator.onLine ? 'Ready offline · Images stay on this device' : 'Offline · Your collection is available') : 'Preparing offline copy…'; };
  addEventListener('online', update); addEventListener('offline', update);
  try {
    await navigator.serviceWorker.register('./sw.js');
    const registration = await navigator.serviceWorker.ready;
    const channel = new MessageChannel();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Offline cache check timed out.')), 6000);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); event.data.ready ? resolve() : reject(new Error('Offline copy incomplete.')); };
      registration.active.postMessage({ type: 'CHECK_OFFLINE' }, [channel.port2]);
    });
    ready = true; $('status-dot').classList.add('ready'); update();
  } catch { status.textContent = 'Offline copy unavailable · Reopen while online'; }
}
async function start() {
  $('add').disabled = true;
  try {
    db = await openDatabase();
    cards = (await transaction('cards', 'readonly', store => store.getAll())).sort((a, b) => a.created - b.created);
    const initialized = await transaction('settings', 'readonly', store => store.get('initialized'));
    if (!initialized && !cards.length) {
      cards = [{ id: 'sample-garden', title: 'Night garden', sample: 'garden', created: 1 }, { id: 'sample-orbit', title: 'Somewhere slow', sample: 'orbit', created: 2 }];
      for (const card of cards) await save(card);
    }
    await transaction('settings', 'readwrite', store => store.put(true, 'initialized'));
    const savedTheme = await transaction('settings', 'readonly', store => store.get('theme'));
    setTheme(['auto', 'light', 'dark'].includes(savedTheme) ? savedTheme : 'auto');
  } catch { notice('Device storage is unavailable. Your images cannot be saved in this browser.'); }
  render(); $('add').disabled = false;
}
start(); prepareOffline();

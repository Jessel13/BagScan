'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
let cart = [];
let memory = loadMemory();
let scanning = false;
let codeReader = null;
let pendingItem = null;
let coItems = [];
let coIndex = 0;

// ─── Memory (localStorage) ───────────────────────────────────────────────────
function loadMemory() {
  try { return JSON.parse(localStorage.getItem('bagscan_memory') || '{}'); }
  catch { return {}; }
}
function saveMemory() {
  try { localStorage.setItem('bagscan_memory', JSON.stringify(memory)); }
  catch {}
}
function rememberItem(barcode, name, price) {
  memory[barcode] = { name, price, lastSeen: Date.now() };
  saveMemory();
}
function recallItem(barcode) {
  return memory[barcode] || null;
}

// ─── EAN-13 Validation ───────────────────────────────────────────────────────
function validateEAN13(code) {
  if (!/^\d{13}$/.test(code)) return false;
  let s = 0;
  for (let i = 0; i < 12; i++) s += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (s % 10)) % 10 === parseInt(code[12]);
}
function isPriceEmbedded(code) { return code && code[0] === '2'; }
function extractEmbeddedPrice(code) { return parseFloat(code.slice(7, 12)) / 100; }

// ─── Open Food Facts lookup ──────────────────────────────────────────────────
async function lookupProduct(barcode) {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json();
    if (data.status === 1 && data.product) {
      const p = data.product;
      const name = p.product_name_en || p.product_name || p.abbreviated_product_name || null;
      return name ? name.trim() : null;
    }
  } catch {}
  return null;
}

// ─── Camera Scanning ─────────────────────────────────────────────────────────
async function startScanning() {
  const video = document.getElementById('camera-video');
  const wrap = document.getElementById('camera-wrap');
  const btn = document.getElementById('scan-toggle-btn');

  try {
    if (typeof ZXing === 'undefined') throw new Error('ZXing not loaded');
    codeReader = new ZXing.BrowserMultiFormatReader();
    const devices = await ZXing.BrowserMultiFormatReader.listVideoInputDevices();
    if (!devices.length) throw new Error('No camera found');
    const backCam = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[devices.length - 1];

    await codeReader.decodeFromVideoDevice(backCam.deviceId, video, (result, err) => {
      if (result) handleScan(result.getText());
    });

    wrap.classList.add('active');
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Stop scanning`;
    btn.classList.add('scanning');
    scanning = true;
    showHint('Point at barcode');
  } catch (e) {
    showToast('Camera error: ' + (e.message || 'Could not access camera'), 'error');
  }
}

function stopScanning() {
  if (codeReader) { try { codeReader.reset(); } catch {} codeReader = null; }
  const wrap = document.getElementById('camera-wrap');
  const btn = document.getElementById('scan-toggle-btn');
  const video = document.getElementById('camera-video');
  if (video.srcObject) { video.srcObject.getTracks().forEach(t => t.stop()); video.srcObject = null; }
  wrap.classList.remove('active');
  btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg> Start scanning`;
  btn.classList.remove('scanning');
  scanning = false;
}

// ─── Handle a scanned barcode ─────────────────────────────────────────────────
let lastScanned = '';
let lastScannedTime = 0;
async function handleScan(code) {
  // Debounce: ignore same barcode within 2.5s
  const now = Date.now();
  if (code === lastScanned && now - lastScannedTime < 2500) return;
  lastScanned = code;
  lastScannedTime = now;

  if (!validateEAN13(code)) {
    showToast('Invalid barcode — please try again', 'error');
    return;
  }

  // Weight/price-embedded barcode (starts with 2)
  if (isPriceEmbedded(code)) {
    const price = extractEmbeddedPrice(code);
    const recalled = recallItem(code);
    const name = recalled ? recalled.name : 'Weighed item';
    addToCart(code, name, price, true);
    showHint('Got it!');
    return;
  }

  // Check memory first
  const recalled = recallItem(code);
  if (recalled) {
    addToCart(code, recalled.name, recalled.price, false);
    showHint('Got it!');
    return;
  }

  // Not in memory — look up name from Open Food Facts
  showHint('Looking up product...');
  const name = await lookupProduct(code);

  pendingItem = { barcode: code, name: name || '' };
  showPricePrompt(name || null);
  showHint('Enter price');
}

// ─── Price Prompt ─────────────────────────────────────────────────────────────
function showPricePrompt(name) {
  const prompt = document.getElementById('price-prompt');
  const ppName = document.getElementById('pp-name');
  const input = document.getElementById('price-input');
  ppName.textContent = name || 'Unknown item — enter name below';
  input.value = '';
  prompt.classList.add('show');
  setTimeout(() => input.focus(), 80);

  // If name unknown, allow editing
  if (!name) {
    ppName.contentEditable = 'true';
    ppName.style.border = '1px dashed #d97706';
    ppName.style.padding = '2px 4px';
    ppName.style.borderRadius = '4px';
  } else {
    ppName.contentEditable = 'false';
    ppName.style.border = '';
    ppName.style.padding = '';
  }
}

function hidePricePrompt() {
  document.getElementById('price-prompt').classList.remove('show');
  pendingItem = null;
}

function confirmPrice() {
  if (!pendingItem) return;
  const input = document.getElementById('price-input');
  const ppName = document.getElementById('pp-name');
  const val = parseFloat(input.value);
  const name = ppName.textContent.trim() || 'Scanned item';

  if (isNaN(val) || val < 0) {
    input.style.outline = '2px solid ' + 'var(--red)';
    setTimeout(() => input.style.outline = '', 800);
    return;
  }

  rememberItem(pendingItem.barcode, name, val);
  addToCart(pendingItem.barcode, name, val, false);
  hidePricePrompt();
  showHint('Added!');
}

function skipPrice() {
  if (!pendingItem) return;
  const ppName = document.getElementById('pp-name');
  const name = ppName.textContent.trim() || 'Scanned item';
  rememberItem(pendingItem.barcode, name, null);
  addToCart(pendingItem.barcode, name, null, false);
  hidePricePrompt();
}

// ─── Cart ─────────────────────────────────────────────────────────────────────
function addToCart(barcode, name, price, weightItem) {
  if (weightItem) {
    cart.push({ barcode, name, price, qty: 1, weightItem: true });
    showToast(`${name} — S$${price.toFixed(2)} (weighed)`, 'success');
  } else {
    const existing = cart.find(i => i.barcode === barcode && !i.weightItem);
    if (existing) {
      existing.qty++;
      const total = existing.price != null ? ` · S$${(existing.price * existing.qty).toFixed(2)}` : '';
      showToast(`${name} ×${existing.qty}${total}`, 'success');
    } else {
      cart.push({ barcode, name, price, qty: 1, weightItem: false });
      const priceStr = price != null ? ` — S$${price.toFixed(2)}` : '';
      showToast(`${name}${priceStr} added`, 'success');
    }
  }
  renderCart();
}

function changeQty(idx, delta) {
  if (cart[idx].qty + delta < 1) { removeItem(idx); return; }
  cart[idx].qty += delta;
  renderCart();
}

function removeItem(idx) {
  cart.splice(idx, 1);
  renderCart();
}

function clearCart() {
  if (cart.length === 0) return;
  if (!confirm('Clear all items from cart?')) return;
  cart = [];
  renderCart();
  hidePricePrompt();
}

function editItemPrice(idx) {
  const item = cart[idx];
  pendingItem = { barcode: item.barcode, name: item.name, editIdx: idx };
  const prompt = document.getElementById('price-prompt');
  const ppName = document.getElementById('pp-name');
  const input = document.getElementById('price-input');
  ppName.textContent = item.name;
  ppName.contentEditable = 'false';
  input.value = item.price != null ? item.price.toFixed(2) : '';
  prompt.classList.add('show');
  setTimeout(() => input.focus(), 80);

  document.getElementById('price-ok-btn').onclick = () => {
    const val = parseFloat(input.value);
    if (isNaN(val) || val < 0) { input.style.outline = '2px solid red'; setTimeout(() => input.style.outline = '', 800); return; }
    cart[pendingItem.editIdx].price = val;
    rememberItem(item.barcode, item.name, val);
    hidePricePrompt();
    renderCart();
    document.getElementById('price-ok-btn').onclick = confirmPrice;
  };
}

function renderCart() {
  const total = cart.reduce((s, i) => s + (i.price || 0) * i.qty, 0);
  const count = cart.reduce((s, i) => s + i.qty, 0);
  document.getElementById('stat-items').textContent = count;
  document.getElementById('stat-unique').textContent = cart.length;
  document.getElementById('stat-total').textContent = 'S$' + total.toFixed(2);
  document.getElementById('checkout-btn').disabled = cart.length === 0;

  const emptyEl = document.getElementById('cart-empty');
  const listEl = document.getElementById('cart-list');

  if (cart.length === 0) {
    emptyEl.style.display = 'flex';
    listEl.innerHTML = '';
    return;
  }
  emptyEl.style.display = 'none';

  listEl.innerHTML = cart.map((item, idx) => {
    const lineTotalStr = item.price != null ? `S$${(item.price * item.qty).toFixed(2)}` : '—';
    const priceEachStr = item.price != null ? `S$${item.price.toFixed(2)} each` : '';
    const weightBadge = item.weightItem ? `<span class="weight-tag">weighed</span>` : '';
    const priceCtrl = item.price == null
      ? `<span class="no-price-tag">no price</span> <button class="edit-price-btn" onclick="editItemPrice(${idx})">add price</button>`
      : `<span class="cart-item-price">${priceEachStr}</span><button class="edit-price-btn" onclick="editItemPrice(${idx})">edit</button>`;
    const qtyCtrl = item.weightItem
      ? `<span class="cart-item-price">×1 · S$${item.price.toFixed(2)}</span>`
      : `<div class="qty-ctrl">
           <button class="qty-btn" onclick="changeQty(${idx},-1)">−</button>
           <span class="qty-val">${item.qty}</span>
           <button class="qty-btn" onclick="changeQty(${idx},1)">+</button>
         </div>
         ${priceCtrl}`;
    return `
      <div class="cart-item">
        <div class="cart-item-top">
          <div class="cart-item-name">${item.name}${weightBadge}</div>
          <div class="cart-item-subtotal">${lineTotalStr}</div>
          <button class="cart-item-del" onclick="removeItem(${idx})" aria-label="Remove">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="cart-item-bottom">${qtyCtrl}</div>
      </div>`;
  }).join('');
}

// ─── Checkout Mode ────────────────────────────────────────────────────────────
function startCheckout() {
  stopScanning();
  coItems = [];
  cart.forEach(item => { for (let i = 0; i < item.qty; i++) coItems.push(item); });
  coIndex = 0;
  showScreen('screen-checkout');
  renderCheckout();
}

function renderCheckout() {
  const item = coItems[coIndex];
  const total = coItems.length;
  document.getElementById('co-progress').textContent = `${coIndex + 1} of ${total}`;
  document.getElementById('co-item-name').textContent = item.name;
  document.getElementById('co-item-detail').textContent =
    `Item ${coIndex + 1} of ${total}` + (item.qty > 1 ? ` (${item.qty}× ${item.name})` : '');
  document.getElementById('co-item-price').textContent =
    item.price != null ? `S$${item.price.toFixed(2)}` : 'Price at kiosk';

  const svg = document.getElementById('co-barcode-svg');
  svg.innerHTML = '';
  try {
    JsBarcode(svg, item.barcode, {
      format: 'EAN13', width: 3, height: 100,
      displayValue: false, margin: 14,
      background: '#ffffff', lineColor: '#000000'
    });
  } catch {}

  document.getElementById('co-barcode-digits').textContent = item.barcode;
  document.getElementById('co-prev-btn').disabled = coIndex === 0;
  document.getElementById('co-done-banner').classList.remove('show');

  const isLast = coIndex === total - 1;
  const nextBtn = document.getElementById('co-next-btn');
  nextBtn.innerHTML = isLast
    ? `Done <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
    : `Next <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
  nextBtn.disabled = false;
}

function nextCoItem() {
  if (coIndex < coItems.length - 1) { coIndex++; renderCheckout(); }
  else {
    document.getElementById('co-done-banner').classList.add('show');
    document.getElementById('co-next-btn').disabled = true;
  }
}

function prevCoItem() {
  if (coIndex > 0) {
    coIndex--;
    document.getElementById('co-done-banner').classList.remove('show');
    document.getElementById('co-next-btn').disabled = false;
    renderCheckout();
  }
}

// ─── History Screen ───────────────────────────────────────────────────────────
function renderHistory() {
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  const entries = Object.entries(memory).sort((a, b) => (b[1].lastSeen || 0) - (a[1].lastSeen || 0));
  if (entries.length === 0) {
    list.innerHTML = '';
    empty.classList.add('show');
    return;
  }
  empty.classList.remove('show');
  list.innerHTML = entries.map(([code, item]) => `
    <div class="history-item">
      <div class="history-item-info">
        <div class="history-item-name">${item.name}</div>
        <div class="history-item-code">${code}</div>
      </div>
      <div class="history-item-price">${item.price != null ? 'S$' + item.price.toFixed(2) : '—'}</div>
    </div>`).join('');
}

function clearMemory() {
  if (!confirm('Clear all remembered items? This cannot be undone.')) return;
  memory = {};
  saveMemory();
  renderHistory();
}

// ─── Screen navigation ────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

// ─── Toast & Hint ─────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}
function showHint(msg) {
  const h = document.getElementById('camera-hint');
  if (h) h.textContent = msg;
}

// ─── Event listeners ──────────────────────────────────────────────────────────
document.getElementById('scan-toggle-btn').addEventListener('click', () => {
  scanning ? stopScanning() : startScanning();
});

document.getElementById('price-ok-btn').addEventListener('click', confirmPrice);
document.getElementById('price-skip-btn').addEventListener('click', skipPrice);
document.getElementById('price-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmPrice(); });

document.getElementById('clear-btn').addEventListener('click', clearCart);
document.getElementById('checkout-btn').addEventListener('click', startCheckout);

document.getElementById('checkout-back-btn').addEventListener('click', () => showScreen('screen-shop'));
document.getElementById('co-next-btn').addEventListener('click', nextCoItem);
document.getElementById('co-prev-btn').addEventListener('click', prevCoItem);

document.getElementById('history-btn').addEventListener('click', () => {
  renderHistory();
  showScreen('screen-history');
});
document.getElementById('history-back-btn').addEventListener('click', () => showScreen('screen-shop'));
document.getElementById('clear-memory-btn').addEventListener('click', clearMemory);

// ─── Init ─────────────────────────────────────────────────────────────────────
renderCart();

// ============================================================
// HomeScope — Settings Page
// ============================================================
'use strict';

let customPoi = [];
let commutePlaces = [];
const COMMUTE_MAX = 5;

async function init() {
  [customPoi, commutePlaces] = await Promise.all([getCustomPoi(), getCommutePlaces()]);
  renderList();
  renderCommutePlaces();
  setupForm();
  setupCommuteForm();
}

function renderList() {
  const list = document.getElementById('custom-poi-list');
  if (!customPoi.length) {
    list.innerHTML = '<div class="poi-empty">尚無自訂項目</div>';
    return;
  }
  list.innerHTML = customPoi.map((item, i) => `
    <div class="poi-row">
      <div class="poi-row-info">
        <span class="poi-row-label">📍 ${escHtml(item.label)}</span>
        <span class="poi-row-keyword">${escHtml(item.keyword)}</span>
      </div>
      <button class="poi-delete-btn" data-idx="${i}" title="刪除">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('.poi-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      customPoi.splice(parseInt(btn.dataset.idx), 1);
      await saveCustomPoi(customPoi);
      renderList();
    });
  });
}

function setupForm() {
  const btnAdd       = document.getElementById('btn-add');
  const errEl        = document.getElementById('add-error');
  const inputLabel   = document.getElementById('input-label');
  const inputKeyword = document.getElementById('input-keyword');

  btnAdd.addEventListener('click', async () => {
    const label   = inputLabel.value.trim();
    const keyword = inputKeyword.value.trim();

    if (!label || !keyword) {
      errEl.classList.remove('hidden');
      return;
    }
    errEl.classList.add('hidden');

    customPoi.push({ key: `c${Date.now()}`, emoji: '📍', label, keyword });
    await saveCustomPoi(customPoi);

    inputLabel.value = '';
    inputKeyword.value = '';
    inputLabel.focus();

    renderList();
  });

  // Enter on last field = add
  inputKeyword.addEventListener('keydown', e => {
    if (e.key === 'Enter') btnAdd.click();
  });
}

// ---- 常去地點 ----
function renderCommutePlaces() {
  const list = document.getElementById('commute-list');
  const form = document.getElementById('commute-form');
  if (!list) return;

  if (form) form.classList.toggle('hidden', commutePlaces.length >= COMMUTE_MAX);

  if (!commutePlaces.length) {
    list.innerHTML = '<div class="poi-empty">尚無常去地點</div>';
    return;
  }
  list.innerHTML = commutePlaces.map((p, i) => `
    <div class="poi-row">
      <div class="poi-row-info">
        <span class="poi-row-label">📍 ${escHtml(p.label)}</span>
        <span class="poi-row-keyword">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span>
      </div>
      <button class="poi-delete-btn" data-ci="${i}" title="刪除">✕</button>
    </div>
  `).join('');
  list.querySelectorAll('[data-ci]').forEach(btn => {
    btn.addEventListener('click', async () => {
      commutePlaces.splice(parseInt(btn.dataset.ci), 1);
      await saveCommutePlaces(commutePlaces);
      renderCommutePlaces();
    });
  });
}

function setupCommuteForm() {
  const btn     = document.getElementById('btn-commute-add');
  const labelEl = document.getElementById('commute-label');
  const addrEl  = document.getElementById('commute-addr');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const label = labelEl.value.trim();
    const addr  = addrEl.value.trim();
    if (!label || !addr) { setCommuteStatus('請填寫名稱和地址', true); return; }
    if (commutePlaces.length >= COMMUTE_MAX) { setCommuteStatus(`最多 ${COMMUTE_MAX} 個地點`, true); return; }

    btn.disabled = true;
    setCommuteStatus('查詢中...', false);
    try {
      const nominatim = async (q) => {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=tw`,
          { headers: { Accept: 'application/json' } }
        );
        return res.json();
      };

      let data = await nominatim(addr);
      let fallback = false;

      if (!data?.length) {
        // 去掉門牌號（如 105號、23之1號）再試一次
        const stripped = addr.replace(/\d+之?\d*號\s*$/, '').trim();
        if (stripped && stripped !== addr) {
          data = await nominatim(stripped);
          if (data?.length) fallback = true;
        }
      }

      if (!data?.length) { setCommuteStatus('找不到此地址，請嘗試只輸入到路名', true); return; }

      const { lat, lon } = data[0];
      commutePlaces.push({ label, lat: parseFloat(lat), lng: parseFloat(lon) });
      await saveCommutePlaces(commutePlaces);
      labelEl.value = '';
      addrEl.value  = '';
      setCommuteStatus(fallback ? '已儲存（精確至路段，門牌號 OSM 未收錄）' : '', false);
      renderCommutePlaces();
    } catch {
      setCommuteStatus('查詢失敗，請稍後再試', true);
    } finally {
      btn.disabled = false;
    }
  });

  addrEl.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
}

function setCommuteStatus(msg, isError) {
  const el = document.getElementById('commute-status');
  if (!el) return;
  if (!msg) { el.classList.add('hidden'); return; }
  el.textContent = msg;
  el.className = isError ? 'add-error' : 'settings-hint';
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', init);

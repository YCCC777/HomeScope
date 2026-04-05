// ============================================================
// HomeScope — Favorites Panel
// 依賴 popup.js 的全域狀態：ui, favList, activeFilter, activeTypeFilter
// ============================================================
'use strict';

// 正向 POI checklist 鍵（三態：undefined/true/false）
const CHECKLIST_KEYS  = ['transit','supermarket','convenience','school','junior','hospital','park','bank','mcdonalds','starbucks'];
const CHECKLIST_ICONS = {
  transit:'🚇', supermarket:'🛒', convenience:'🏪',
  school:'🏫', junior:'🏫', hospital:'🏥', park:'🌳', bank:'🏦',
  mcdonalds:'🍟', starbucks:'☕',
};

// 嫌惡設施鍵（語義反轉：true=有設施=壞，false=確認無=好）
const HAZARD_KEYS  = ['temple','funeral','columbarium','ktv','gasStation','powerTower','garbage'];
const HAZARD_ICONS = {
  temple:'🏮', funeral:'⚰️', columbarium:'🪦',
  ktv:'🍺', gasStation:'⛽', powerTower:'⚡', garbage:'🗑️',
};

// 快選標籤
const QUICK_TAG_KEYS = [
  'tag_first_choice','tag_backup','tag_negotiate',
  'tag_too_expensive','tag_bad_transit','tag_old_building',
  'tag_nice_view','tag_quiet',
];
function getQuickTags() {
  return QUICK_TAG_KEYS.map(k => ui[k] || k);
}

// 展開狀態追蹤
const expandedIds = new Set();
let _compareIds = [];
let activeSort = 'time';

// ---- 計算地段評分（正向 checklist）----
function calcScore(f) {
  const cl = f.checklist || {};
  let confirmed = 0, yes = 0;
  for (const key of CHECKLIST_KEYS) {
    if (cl[key] !== undefined) { confirmed++; if (cl[key] === true) yes++; }
  }
  return { yes, total: CHECKLIST_KEYS.length, confirmed };
}

// ---- 主渲染函式 ----
async function renderFavorites() {
  const list = document.getElementById('fav-list');
  if (!list) return;

  buildFilterPills();
  buildSortBar();

  let filtered = favList;
  if (activeFilter !== 'ALL') {
    filtered = filtered.filter(f => (f.viewingStatus || 'unvisited') === activeFilter);
  }
  if (activeTypeFilter !== 'ALL') {
    filtered = filtered.filter(f => (f.listingType || 'rent') === activeTypeFilter);
  }

  // 排序
  if (activeSort === 'price') {
    filtered = [...filtered].sort((a, b) => (a.totalPrice || Infinity) - (b.totalPrice || Infinity));
  } else if (activeSort === 'rating') {
    filtered = [...filtered].sort((a, b) => (b.viewingRating || 0) - (a.viewingRating || 0));
  } else {
    filtered = [...filtered].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  }

  if (filtered.length === 0) {
    list.innerHTML = '';
    show('fav-empty');
    return;
  }
  hide('fav-empty');

  list.innerHTML = filtered.map(f => buildFavItemHTML(f)).join('');

  // 恢復展開狀態
  for (const id of expandedIds) {
    const detail = document.getElementById(`fav-detail-${id}`);
    if (detail) detail.classList.remove('hidden');
  }

  // 綁定展開
  list.querySelectorAll('.fav-item-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('fav-compare-cb')) return;
      const id = row.closest('.fav-item').dataset.id;
      toggleFavDetail(id);
    });
  });

  // 綁定比較勾選
  list.querySelectorAll('.fav-compare-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      _compareIds = [...document.querySelectorAll('.fav-compare-cb:checked')].map(c => c.dataset.id);
      setCompareSelection(_compareIds);
      renderCompare();
      updateBatchBar(_compareIds);
    });
  });

  updateBatchBar(_compareIds);
  getCompareSelection().then(savedIds => {
    _compareIds = savedIds || [];
    _compareIds.forEach(id => {
      const cb = document.querySelector(`.fav-compare-cb[data-id="${id}"]`);
      if (cb) cb.checked = true;
    });
    renderCompare();
    updateBatchBar(_compareIds);
  });

  bindFavActions(list);
}

// ---- 篩選器 Pill ----
function buildFilterPills() {
  // 更新全部按鈕數量
  const allBtn = document.getElementById('fav-pill-all');
  if (allBtn) allBtn.textContent = `全部 ${favList.length}`;

  // 狀態篩選 pill 設定 active
  ['fav-pill-all','fav-pill-unvisited','fav-pill-scheduled','fav-pill-visited'].forEach(id => {
    const pill = document.getElementById(id);
    if (!pill) return;
    const filterVal = pill.dataset.filter;
    pill.classList.toggle('active', activeFilter === filterVal);
    pill.onclick = () => {
      activeFilter = filterVal;
      renderFavorites();
    };
  });

  // 類型篩選 pill 設定 active
  ['type-pill-all','type-pill-rent','type-pill-sale'].forEach(id => {
    const pill = document.getElementById(id);
    if (!pill) return;
    const typeVal = pill.dataset.type;
    pill.classList.toggle('active', activeTypeFilter === typeVal);
    pill.onclick = () => {
      activeTypeFilter = typeVal;
      renderFavorites();
    };
  });
}

// ---- 排序列 ----
function buildSortBar() {
  const bar = document.getElementById('fav-sort-bar');
  if (!bar) return;
  bar.querySelectorAll('.sort-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.sort === activeSort);
    pill.onclick = () => { activeSort = pill.dataset.sort; renderFavorites(); };
  });
}

// ---- 建立收藏條目 HTML ----
function buildFavItemHTML(f) {
  const name   = escHtml(f.name || f.url);
  const tags   = f.tags?.length ? f.tags.join(', ') : '';
  const status = f.viewingStatus || 'unvisited';
  const statusLabel = { visited: '已看', scheduled: '預約中', unvisited: '未看' }[status];
  const typeLabel   = f.listingType === 'rent' ? '租' : '售';

  // 價格 + 漲跌
  const currentPrice = f.totalPrice || null;
  const hist  = f.priceHistory || [];
  const delta = hist.length >= 2 ? hist.at(-1).price - hist.at(-2).price : null;
  let priceHtml = '';
  if (currentPrice) {
    const priceStr = f.listingType === 'rent'
      ? `${currentPrice.toLocaleString()} 元/月`
      : `${currentPrice.toLocaleString()} 萬`;
    if (delta && delta !== 0) {
      const sign = delta < 0 ? '↓' : '↑';
      const cls  = delta < 0 ? 'price-down' : 'price-up';
      const diff = f.listingType === 'rent'
        ? `${Math.abs(delta).toLocaleString()}元`
        : `${Math.abs(delta)}萬`;
      priceHtml = `<span class="fav-price ${cls}">${priceStr} ${sign}${diff}</span>`;
    } else {
      priceHtml = `<span class="fav-price">${priceStr}</span>`;
    }
  }

  // 規格摘要列
  const RENT_LABEL_SHOW = new Set(['可養寵物','可開伙','可報稅','租金補貼']);
  const specParts = [];
  if (f.size)         specParts.push(`${f.size}坪`);
  if (f.buildingType) specParts.push(f.buildingType);
  if (f.buildingAge)  specParts.push(`屋齡${f.buildingAge}`);
  if (f.floor)        specParts.push(`${f.floor}F`);
  if (f.rentLabels?.length) {
    f.rentLabels.filter(l => RENT_LABEL_SHOW.has(l)).slice(0, 2).forEach(l => specParts.push(l));
  }
  const specRow = specParts.length
    ? `<div class="fav-spec-row">${escHtml(specParts.join(' · '))}</div>`
    : '';

  return `
  <div class="fav-item" data-id="${f.id}">
    <div class="fav-item-row">
      <input type="checkbox" class="fav-compare-cb" data-id="${f.id}" title="${escHtml(ui.fav_compare_select || '加入比較')}">
      <span class="fav-type-badge ${f.listingType || 'sale'}">${typeLabel}</span>
      <button class="fav-status-pill ${status}" data-vs-toggle data-fav-id="${f.id}" title="點擊切換看房狀態">${statusLabel}</button>
      <div class="fav-item-info">
        <div class="fav-item-name-row">
          <span class="fav-item-name" title="${name}">${name}</span>
          ${priceHtml}
        </div>
        ${specRow}
      </div>
    </div>
    <div class="fav-item-detail hidden" id="fav-detail-${f.id}">
      ${buildChecklistHTML(f)}
      ${buildHazardHTML(f)}
      ${buildViewingHTML(f)}
      <div class="tag-chips-wrap" id="tag-chips-${f.id}">${renderTagChips(f)}</div>
      <input class="fav-input" data-field="name" data-id="${f.id}" placeholder="${escHtml(ui.fav_name_placeholder || '自訂名稱...')}" value="${escHtml(f.name || '')}">
      <input class="fav-input" data-field="tags" data-id="${f.id}" placeholder="${escHtml(ui.fav_tags_placeholder || '標籤（逗號分隔）')}" value="${escHtml(tags)}">
      <div class="fav-action-row">
        <button class="fav-detail-btn fav-btn-icon" data-action="pin" data-id="${f.id}" title="Google Maps">📍</button>
        ${f.url ? `<a class="fav-detail-btn fav-link-btn fav-btn-grow" href="${escHtml(f.url)}" target="_blank" rel="noopener">🔗 591 頁面</a>` : '<span class="fav-btn-grow"></span>'}
        <button class="fav-detail-btn danger fav-btn-icon" data-action="delete" data-id="${f.id}" title="${escHtml(ui.fav_delete || '移除')}">🗑️</button>
      </div>
    </div>
  </div>`;
}

// ---- 正向 POI Checklist HTML（緊湊 pill 版）----
function buildChecklistHTML(f) {
  const cl = f.checklist || {};
  const items = CHECKLIST_KEYS.map(key => {
    const val = cl[key];
    const cls = val === true ? ' ck-yes' : val === false ? ' ck-no' : '';
    const icon = val === true ? '✅' : val === false ? '❌' : CHECKLIST_ICONS[key];
    return `<button class="ck-pill${cls}" data-ck-key="${key}" data-fav-id="${f.id}">${icon} ${escHtml(ui[`checklist_${key}`] || key)}</button>`;
  }).join('');
  return `<div class="ck-pill-wrap">${items}</div>`;
}

// ---- 嫌惡設施 HTML（緊湊 pill 版）----
function buildHazardHTML(f) {
  const hz = f.hazards || {};
  const items = HAZARD_KEYS.map(key => {
    const val = hz[key];
    const cls = val === true ? ' hz-has' : val === false ? ' hz-none' : '';
    const icon = val === true ? '⚠️' : val === false ? '✅' : HAZARD_ICONS[key];
    const hzKey = key === 'gasStation' ? 'gas_station' : key === 'powerTower' ? 'power_tower' : key;
    return `<button class="ck-pill hz-pill${cls}" data-hz-key="${key}" data-fav-id="${f.id}">${icon} ${escHtml(ui[`hazard_${hzKey}`] || key)}</button>`;
  }).join('');
  return `<div class="ck-pill-wrap hz-pill-wrap">${items}</div>`;
}

// ---- 看房管理 HTML（狀態切換移至卡片，此處只留評分和筆記）----
function buildViewingHTML(f) {
  const rating = f.viewingRating || 0;
  const note   = escHtml(f.viewingNote || '');
  const stars  = [1,2,3,4,5].map(n =>
    `<button class="rating-star${n <= rating ? ' filled' : ''}" data-star="${n}" data-fav-id="${f.id}">★</button>`
  ).join('');
  return `
  <div class="rating-row"><span class="rating-label">評分</span>${stars}</div>
  <textarea class="fav-note-area" data-field="viewingNote" data-id="${f.id}" placeholder="${escHtml(ui.viewing_note_placeholder || '看房筆記...')}">${note}</textarea>`;
}

// ---- 標籤快選 Chips ----
function renderTagChips(f) {
  const tags = f.tags || [];
  return getQuickTags().map(label => {
    const active = tags.includes(label) ? ' active' : '';
    return `<button class="tag-chip${active}" data-tag-label="${escHtml(label)}" data-fav-id="${f.id}">${escHtml(label)}</button>`;
  }).join('');
}

// ---- 展開/收折 ----
function toggleFavDetail(id) {
  const detail = document.getElementById(`fav-detail-${id}`);
  if (!detail) return;
  const isHidden = detail.classList.toggle('hidden');
  if (isHidden) expandedIds.delete(id);
  else expandedIds.add(id);
}

// ---- 事件綁定 ----
function bindFavActions(container) {
  // 動作按鈕
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { action, id } = btn.dataset;
      const f = favList.find(x => x.id === id);
      if (!f) return;
      if (action === 'delete') {
        favList = await removeFavorite(id);
        renderFavorites(); renderCompare(); updateSaveButton();
      } else if (action === 'pin') {
        openUrl(`https://www.google.com/maps?q=${f.lat},${f.lng}`);
      }
    });
  });

  // 狀態 pill 直接點擊循環切換（未看→預約中→已看→未看）
  container.querySelectorAll('.fav-status-pill[data-vs-toggle]').forEach(pill => {
    pill.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { favId } = pill.dataset;
      const f = favList.find(x => x.id === favId);
      if (!f) return;
      const cur  = f.viewingStatus || 'unvisited';
      const next = cur === 'unvisited' ? 'scheduled' : cur === 'scheduled' ? 'visited' : 'unvisited';
      favList = await updateFavorite(favId, { viewingStatus: next });
      renderFavorites();
    });
  });

  // 正向 checklist 三態循環
  container.querySelectorAll('.ck-pill[data-ck-key]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { ckKey, favId } = el.dataset;
      const f = favList.find(x => x.id === favId);
      if (!f) return;
      const cur = (f.checklist || {})[ckKey];
      const next = cur === undefined ? true : cur === true ? false : undefined;
      const newCl = { ...f.checklist };
      if (next === undefined) delete newCl[ckKey];
      else newCl[ckKey] = next;
      favList = await updateFavorite(favId, { checklist: newCl });
      renderFavorites(); renderCompare();
    });
  });

  // 嫌惡設施三態循環（語義反轉）
  container.querySelectorAll('.hz-pill[data-hz-key]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { hzKey, favId } = el.dataset;
      const f = favList.find(x => x.id === favId);
      if (!f) return;
      const cur = (f.hazards || {})[hzKey];
      // undefined → true（有設施）→ false（確認無）→ undefined
      const next = cur === undefined ? true : cur === true ? false : undefined;
      const newHz = { ...f.hazards };
      if (next === undefined) delete newHz[hzKey];
      else newHz[hzKey] = next;
      favList = await updateFavorite(favId, { hazards: newHz });
      renderFavorites(); renderCompare();
    });
  });

  // 評分星星
  container.querySelectorAll('.rating-star').forEach(star => {
    star.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { star: n, favId } = star.dataset;
      const f = favList.find(x => x.id === favId);
      if (!f) return;
      const newRating = f.viewingRating === parseInt(n) ? null : parseInt(n);
      favList = await updateFavorite(favId, { viewingRating: newRating });
      renderFavorites();
    });
  });

  // 看房筆記 textarea（blur 後儲存）
  container.querySelectorAll('.fav-note-area').forEach(ta => {
    ta.addEventListener('blur', async () => {
      const { id } = ta.dataset;
      favList = await updateFavorite(id, { viewingNote: ta.value });
    });
  });

  // 標籤快選 chip
  container.querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { tagLabel, favId } = chip.dataset;
      const f = favList.find(x => x.id === favId);
      if (!f) return;
      const tags = [...(f.tags || [])];
      const idx = tags.indexOf(tagLabel);
      if (idx === -1) tags.push(tagLabel);
      else tags.splice(idx, 1);
      favList = await updateFavorite(favId, { tags });
      renderFavorites();
    });
  });

  // 文字輸入（blur 後儲存）
  container.querySelectorAll('.fav-input').forEach(input => {
    input.addEventListener('blur', async () => {
      const { field, id } = input.dataset;
      if (!field || !id) return;
      const val = input.value.trim();
      const patch = field === 'tags'
        ? { tags: val ? val.split(',').map(t => t.trim()).filter(Boolean) : [] }
        : { [field]: val };
      favList = await updateFavorite(id, patch);
      renderFavorites();
    });
  });
}

// ---- 批次刪除 ----
function updateBatchBar(checkedIds) {
  const bar     = document.getElementById('fav-batch-bar');
  const countEl = document.getElementById('fav-batch-count');
  const btn     = document.getElementById('btn-batch-delete');
  if (checkedIds.length > 0) {
    if (bar) bar.classList.remove('hidden');
    if (countEl) countEl.textContent = (ui?.batch_selected || '已選 {n} 筆').replace('{n}', checkedIds.length);
    if (btn) btn.disabled = false;
  } else {
    if (bar) bar.classList.add('hidden');
    if (countEl) countEl.textContent = '';
    if (btn) btn.disabled = true;
  }
}

function setupBatchDelete() {
  const btn = document.getElementById('btn-batch-delete');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const checked = [...document.querySelectorAll('.fav-compare-cb:checked')].map(c => c.dataset.id);
    if (checked.length === 0) return;
    for (const id of checked) {
      favList = await removeFavorite(id);
    }
    _compareIds = [];
    setCompareSelection([]);
    await renderFavorites();
    renderCompare();
    updateSaveButton();
  });
}

// ---- 匯出 / 匯入 ----
function setupFavImportExport() {
  const exportBtn = document.getElementById('btn-export');
  const importBtn = document.getElementById('btn-import');
  const fileInput = document.getElementById('import-file-input');
  if (!exportBtn || !importBtn || !fileInput) return;

  exportBtn.onclick = () => {
    const blob = new Blob([JSON.stringify(favList, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `homescope-favorites-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  importBtn.onclick = () => fileInput.click();

  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('格式錯誤');
      for (const item of data) {
        if (!item.id || item.lat == null) continue;
        favList = await addFavorite(item);
      }
      renderFavorites(); renderCompare();
    } catch (err) {
      console.error('[HomeScope] import error:', err);
    }
    fileInput.value = '';
  };
}

// ============================================================
// 一鍵更新價格
// ============================================================
function setupFavRefreshPrices() {
  const btn = document.getElementById('btn-refresh-prices');
  if (!btn) return;
  setText('label-refresh-prices', ui.fav_refresh_prices || '追蹤房價');
  btn.addEventListener('click', refreshAllPrices);
}

async function refreshAllPrices() {
  const btn = document.getElementById('btn-refresh-prices');
  if (!btn || btn.disabled) return;
  const toRefresh = favList.filter(f => f.url && (f.source === 'sale591' || f.source === 'rent591'));
  if (!toRefresh.length) return;

  btn.disabled = true;
  const labelEl = document.getElementById('label-refresh-prices');
  let done = 0;
  for (const fav of toRefresh) {
    if (labelEl) labelEl.textContent = `${done}/${toRefresh.length}`;
    try {
      const price = await fetchPriceFromUrl(fav.url, fav.source);
      if (price != null) {
        const history = fav.priceHistory || [];
        if (!history.length || history.at(-1).price !== price) {
          const newHistory = [...history, { price, date: new Date().toISOString().slice(0, 10) }].slice(-10);
          favList = await updateFavorite(fav.id, { priceHistory: newHistory });
        }
      }
    } catch (e) {
      console.warn('[HomeScope] price refresh failed:', fav.url, e);
    }
    done++;
  }

  btn.disabled = false;
  if (labelEl) labelEl.textContent = ui.fav_refresh_prices || '追蹤房價';
  renderFavorites();
  renderCompare();
}

// ---- fetch SSR HTML → 解析 inline script 取得價格 ----
async function fetchPriceFromUrl(url, source) {
  try {
    const resp = await fetch(url, {
      credentials: 'omit',
      headers: { 'Accept': 'text/html,application/xhtml+xml' },
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    for (const script of doc.querySelectorAll('script:not([src])')) {
      const text = script.textContent;
      if (!text || text.length > 5_000_000) continue;

      if (source === 'sale591') {
        // dataLayer.push({ event:'detail_page_view', price_name: 2888, ... })
        const m = text.match(/"price_name"\s*:\s*([0-9]+(?:\.[0-9]+)?)/);
        if (m) {
          const price = parseFloat(m[1]);
          if (price > 0) return price;
        }
      } else if (source === 'rent591') {
        // window.__NUXT__ IIFE 或物件中 "price": 136500
        const m = text.match(/"price"\s*:\s*([1-9][0-9]{3,})/);
        if (m) {
          const price = parseFloat(m[1]);
          if (price > 0) return price;
        }
      }
    }
  } catch (e) {}
  return null;
}

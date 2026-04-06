// ============================================================
// HomeScope — Popup Script
// ============================================================
'use strict';

// ---- 全域狀態 ----
let coords      = null;   // { lat, lng }
let keywords    = null;   // TW_POI_KEYWORDS
let ui          = null;   // UI_STRINGS
let currentData = null;   // 最新的 extractor 回應
let currentUrl  = '';     // 目前物件 URL
let currentTabTitle = ''; // 目前分頁標題
let favList     = [];     // 快取的收藏陣列
let customPoiList = [];   // 自訂 POI 項目
let activeFilter     = 'ALL';  // viewingStatus 篩選
let activeTypeFilter = 'ALL';  // listingType 篩選
let currentRadius = 15;        // 地圖縮放（對應搜尋半徑）
let _specsReady   = Promise.resolve(); // 規格非同步任務，存入前等待
let commutePlaces = [];        // 常去地點

// ============================================================
// 初始化
// ============================================================
async function init() {
  ui = getUiStrings();
  keywords = getSearchKeywords();

  const storedRadius = await new Promise(r =>
    chrome.storage.local.get('hs_radius', res => r(res['hs_radius'] || null))
  );
  if (storedRadius) {
    currentRadius = parseInt(storedRadius) || 15;
    const sel = document.getElementById('select-radius');
    if (sel) sel.value = String(currentRadius);
  }

  applyUiText();
  setupTabs();
  setupRadiusSelect();
  setupHazardsToggle();
  setupGeoRiskToggle();
  setupMarketToggle();

  [favList, customPoiList, commutePlaces] = await Promise.all([
    getFavorites(),
    getCustomPoi(),
    getCommutePlaces(),
  ]);

  renderCustomPoiButtons();
  await queryActiveTab();
  renderFavorites();
  renderCompare();
  setupFavImportExport();
  setupFavRefreshPrices();
  setupBatchDelete();
  await renderHistory();
  setupHistoryToggle();
  setupFooter();
}

// ============================================================
// 頁籤切換
// ============================================================
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `pane-${tab}`));
}

// ============================================================
// UI 文字
// ============================================================
function applyUiText() {
  setText('header-title',      'HomeScope');
  setText('status-text',       ui.status_detecting);
  setText('tab-search',        ui.tab_search);
  setText('tab-favorites',     ui.tab_favorites);
  setText('tab-compare',       ui.tab_compare);
  setText('label-poi',         ui.label_poi);
  setText('label-hazards',     ui.label_hazards);
  setText('label-map-center',  ui.map_center_hint);
  setText('label-pin-badge',   ui.pin_badge);
  setText('label-radius',      ui.radius_label);
  setText('label-haunted',     ui.btn_haunted);
  setText('label-lvr',         ui.btn_lvr);
  setText('label-school',      ui.btn_school);
  setText('label-save',        ui.btn_save);
  // 收藏頁
  setText('fav-pill-all',      ui.fav_filter_all);
  setText('fav-pill-unvisited',ui.fav_filter_unvisited);
  setText('fav-pill-scheduled',ui.fav_filter_scheduled);
  setText('fav-pill-visited',  ui.fav_filter_visited);
  setText('type-pill-all',     '全部');
  setText('type-pill-rent',    ui.fav_filter_rent);
  setText('type-pill-sale',    ui.fav_filter_sale);
  setText('label-fav-empty',   ui.fav_empty);
  setText('label-fav-empty-hint', ui.fav_empty_hint);
  setText('label-export',      ui.fav_export);
  setText('label-import',      ui.fav_import);
  setText('label-batch-delete',ui.batch_delete);
  // 比較頁
  setText('label-compare-empty', ui.compare_empty);
  setText('label-share-copy',  ui.share_copy);
  // Footer
  setText('footer-brand-main', '🏠 HomeScope');
  setText('footer-brand-sub',  ui.footer_links);
}

// ============================================================
// 查詢目前 Tab
// ============================================================
function queryActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) { showNotListing(); resolve(); return; }

      const tab = tabs[0];
      const url = tab.url || '';
      currentUrl = url;
      currentTabTitle = tab.title || '';

      const isRent = /rent\.591\.com\.tw\/\d+/.test(url);
      const isSale = /sale\.591\.com\.tw\/home\/house\/detail\//.test(url);

      if (!isRent && !isSale) { showNotListing(); resolve(); return; }

      const extractorFiles = isRent
        ? ['extractors/base.js', 'extractors/591rent.js']
        : ['extractors/base.js', 'extractors/591sale.js'];

      // 先試 content.js（ISOLATED world）
      chrome.tabs.sendMessage(tab.id, { action: 'getCoordinates' }, (response) => {
        if (!chrome.runtime.lastError && response?.success) {
          handleResponse(response); resolve(); return;
        }
        // ISOLATED world 失敗 → MAIN world 重試（可存取 window.__NUXT__）
        chrome.scripting.executeScript(
          { target: { tabId: tab.id }, files: extractorFiles, world: 'MAIN' },
          () => {
            if (chrome.runtime.lastError) { showError(); resolve(); return; }
            chrome.scripting.executeScript(
              {
                target: { tabId: tab.id },
                func: () => {
                  try {
                    if (typeof window.__siteExtractFn !== 'function') return null;
                    const r = window.__siteExtractFn();
                    if (!r || r.lat == null) return null;
                    let country = r.country || null;
                    if (!country && typeof detectCountryFromCoords === 'function') {
                      country = detectCountryFromCoords(r.lat, r.lng);
                    }
                    return {
                      success:       true,
                      lat:           r.lat,
                      lng:           r.lng,
                      name:          r.name    || null,
                      address:       r.address || null,
                      country:       country,
                      source:        r.source  || null,
                      strategy:      r.strategy || null,
                      url:           location.href,
                      communityId:   r.communityId   || null,
                      communityName: r.communityName || null,
                    };
                  } catch (e) {}
                  return null;
                },
                world: 'MAIN',
              },
              (results) => {
                const data = results?.[0]?.result;
                if (data?.success) {
                  chrome.runtime.sendMessage({ action: 'coordinatesUpdated', data, tabId: tab.id }).catch(() => {});
                  handleResponse(data); resolve();
                } else {
                  showError(); resolve();
                }
              }
            );
          }
        );
      });
    });
  });
}

// ============================================================
// 處理 extractor 回應
// ============================================================
function handleResponse(response) {
  if (!response || !response.success) { showError(); return; }

  currentData = response;
  coords      = { lat: response.lat, lng: response.lng };

  renderSuccess(response);
  bindSearchButtons();
  updateSaveButton();
  resetGeoRisk();  // 重置為 — 等待查詢

  // 記錄瀏覽歷史
  addHistory({
    id:      urlToId(currentUrl),
    name:    response.name || currentTabTitle || currentUrl,
    url:     currentUrl,
    lat:     response.lat,
    lng:     response.lng,
    country: 'TW',
    source:  detectSource(currentUrl),
  }).then(() => renderHistory());

  // 物件規格
  const src = detectSource(currentUrl);
  _specsReady = Promise.resolve(); // 重置
  if (src === 'rent591') {
    if (response.specs) {
      renderSpecs(response.specs);
      _backfillSpecs(response.specs);
      _checkPriceChange(response.specs);
    } else {
      _specsReady = fetchRentSpecs().then(specs => {
        if (!specs) return;
        currentData.specs = specs;
        renderSpecs(specs);
        _backfillSpecs(specs);
        _checkPriceChange(specs);
        if (specs.address && !currentData.address) {
          currentData.address = specs.address;
          const el = document.getElementById('address-text');
          if (el) { el.textContent = specs.address; el.classList.remove('hidden'); }
        }
      });
    }
  } else if (src === 'sale591') {
    // dataLayer（MAIN world）有總價/坪數/單價/屋齡/樓層；DOM 有格局字串
    // 兩邊合併：DOM specs 先渲染，dataLayer 補完
    const domSpecs = response.specs || null;
    if (domSpecs) renderSpecs(domSpecs);
    _specsReady = fetchSaleSpecs().then(dlSpecs => {
      if (!dlSpecs) return;
      const merged = Object.assign({}, domSpecs || {}, dlSpecs, {
        layout: domSpecs?.layout || null,   // 保留 DOM 的完整格局字串（如 2房1廳1衛1陽台）
      });
      currentData.specs = merged;
      renderSpecs(merged);
      _backfillSpecs(merged);
      _checkPriceChange(merged);
    });

    // 社區成交行情 + 社區資訊按鈕
    if (response.communityId) {
      currentData.communityId   = response.communityId;
      currentData.communityName = response.communityName || null;
      showMarketSection(response.communityId);
      show('community-row');
    } else {
      hide('community-row');
    }
  }

  // 若 extractor 未提供地址，非同步 reverse geocode
  if (!response.address) {
    reverseGeocode(response.lat, response.lng).then(addr => {
      if (!addr) return;
      currentData.address = addr;
      const addrEl = document.getElementById('address-text');
      if (addrEl) {
        addrEl.textContent = addr;
        addrEl.classList.remove('hidden');
      }
    });
  }
}

// ============================================================
// 搜尋頁 UI 渲染
// ============================================================
function showNotListing() {
  hide('status-bar'); show('not-listing');
}

function showError() {
  const bar = document.getElementById('status-bar');
  if (bar) bar.className = 'state-error';
  setText('status-text', ui.status_failed);
  show('not-listing');
}

function renderSuccess(data) {
  const bar = document.getElementById('status-bar');
  if (bar) bar.className = 'state-success';
  setText('status-text', '');

  const src = detectSource(currentUrl);
  setText('source-badge', src ? (ui[`source_${src}`] || src) : '');

  const addrEl = document.getElementById('address-text');
  if (addrEl) {
    const addr = data.address || data.name || '';
    addrEl.textContent = addr;
    addrEl.classList.toggle('hidden', !addr);
  }

  const nameEl = document.getElementById('detected-name');
  if (nameEl) {
    const n = data.name || (currentTabTitle || '').replace(/\s*[-|｜]\s*591.*/i, '').trim();
    nameEl.textContent = n;
    nameEl.classList.toggle('hidden', !n);
  }

  setText('coord-lat', data.lat.toFixed(5));
  setText('coord-lng', data.lng.toFixed(5));

  renderCommuteChips(data.lat, data.lng);

  show('property-info');
  show('search-sections');
  hide('not-listing');
}

function detectSource(url) {
  if (url.includes('rent.591.com.tw')) return 'rent591';
  if (url.includes('sale.591.com.tw')) return 'sale591';
  return null;
}

// ============================================================
// 搜尋按鈕綁定
// ============================================================
function bindSearchButtons() {
  const { lat, lng } = coords;
  const kw = keywords;
  const r  = () => currentRadius;

  on('btn-pin', () => openUrl(`https://www.google.com/maps?q=${lat},${lng}`));

  // 正向 POI
  const poiKeys = ['transit','supermarket','convenience','school','junior','hospital','park','bank','mcdonalds','starbucks'];
  for (const key of poiKeys) {
    on(`btn-${key.replace('_','-')}`, () => openUrl(buildMapsUrl(lat, lng, kw[key], r())));
  }

  // 嫌惡設施
  on('btn-temple',      () => openUrl(buildMapsUrl(lat, lng, kw.temple,      r())));
  on('btn-funeral',     () => openUrl(buildMapsUrl(lat, lng, kw.funeral,     r())));
  on('btn-columbarium', () => openUrl(buildMapsUrl(lat, lng, kw.columbarium, r())));
  on('btn-ktv',         () => openUrl(buildMapsUrl(lat, lng, kw.ktv,         r())));
  on('btn-gas-station', () => openUrl(buildMapsUrl(lat, lng, kw.gasStation,  r())));
  on('btn-power-tower', () => openUrl(buildMapsUrl(lat, lng, kw.powerTower,  r())));
  on('btn-garbage',     () => openUrl(buildMapsUrl(lat, lng, kw.garbage,     r())));

  // 凶宅 / 實價登錄 link-out
  // 自訂地點（動態渲染的按鈕，直接查 DOM 綁定）
  const customGrid = document.getElementById('custom-poi-grid');
  if (customGrid) {
    customGrid.querySelectorAll('[id^="btn-custom-"]').forEach(btn => {
      const key = btn.id.replace('btn-custom-', '');
      const item = customPoiList.find(p => p.key === key);
      if (item) btn.onclick = () => openUrl(buildMapsUrl(lat, lng, item.keyword, r()));
    });
  }

  on('btn-haunted', () => {
    const addr = encodeURIComponent((currentData?.address || currentData?.name || '') + ' 凶宅');
    openUrl(`https://www.google.com/search?q=${addr}`);
  });
  on('btn-lvr', () => {
    openUrl('https://lvr.land.moi.gov.tw/jsp/list.jsp');
  });
  on('btn-school', () => {
    const addr = encodeURIComponent((currentData?.address || currentData?.name || '') + ' 國小學區');
    openUrl(`https://www.google.com/search?q=${addr}`);
  });
  on('btn-community', () => {
    if (currentData?.communityId) {
      openUrl(`https://market.591.com.tw/${currentData.communityId}/overview`);
    }
  });

  // 收藏切換
  on('btn-save', handleSaveToggle);
}

// ============================================================
// 搜尋半徑
// ============================================================
function setupRadiusSelect() {
  const sel = document.getElementById('select-radius');
  if (!sel) return;
  sel.addEventListener('change', () => {
    currentRadius = parseInt(sel.value) || 15;
    chrome.storage.local.set({ hs_radius: sel.value }).catch(() => {});
  });
}

// ============================================================
// 嫌惡設施收折
// ============================================================
function setupHazardsToggle() {
  const toggle = document.getElementById('btn-hazards-toggle');
  const body   = document.getElementById('hazards-body');
  const arrow  = document.getElementById('hazards-arrow');
  if (!toggle || !body) return;
  toggle.addEventListener('click', () => {
    const isOpen = !body.classList.contains('hidden');
    body.classList.toggle('hidden', isOpen);
    if (arrow) arrow.classList.toggle('open', !isOpen);
  });
}

// ============================================================
// 環境風險
// ============================================================

let geoRiskFetched = false;  // 每個物件只查一次

function setupGeoRiskToggle() {
  const toggle = document.getElementById('btn-geo-risk-toggle');
  const body   = document.getElementById('geo-risk-body');
  const arrow  = document.getElementById('geo-risk-arrow');
  if (!toggle || !body) return;
  toggle.addEventListener('click', () => {
    const isOpen = !body.classList.contains('hidden');
    body.classList.toggle('hidden', isOpen);
    if (arrow) arrow.classList.toggle('open', !isOpen);
    // 第一次展開時才查詢，避免每次開 popup 都打 API
    if (!isOpen && !geoRiskFetched && coords) {
      geoRiskFetched = true;
      fetchGeoRisk(coords.lat, coords.lng);
    }
  });
}

function resetGeoRisk() {
  geoRiskFetched = false;
  setGeoVal('liquid', '—', '');
  setGeoVal('flood',  '—', '');
  setGeoVal('fault',  '—', '');
}

function setGeoVal(key, text, riskClass) {
  const el = document.getElementById(`geo-val-${key}`);
  if (!el) return;
  el.textContent = text;
  el.className = `geo-risk-value ${riskClass}`.trim();
}

async function fetchGeoRisk(lat, lng) {
  setGeoVal('liquid', '查詢中...', 'geo-loading');
  setGeoVal('flood',  '查詢中...', 'geo-loading');
  setGeoVal('fault',  '查詢中...', 'geo-loading');

  // 三個查詢並行
  await Promise.allSettled([
    fetchLiquefaction(lat, lng),
    fetchFlood(lat, lng),
    fetchFault(lat, lng),
  ]);
}

// ---- 土壤液化（走 background，無 CORS）----
async function fetchLiquefaction(lat, lng) {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'fetchLiquefaction', lat, lng });
    if (!res?.success) throw new Error(res?.error || 'failed');
    const degree = String(res.data?.Content?.Degree);
    const map = {
      '1': ['高潛勢', 'geo-high'],
      '3': ['中潛勢', 'geo-mid'],
      '2': ['低潛勢', 'geo-low'],
      '4': ['無資料', 'geo-none'],
    };
    const [label, cls] = map[degree] || ['無資料', 'geo-none'];
    setGeoVal('liquid', label, cls);
  } catch {
    setGeoVal('liquid', '無法查詢', 'geo-none');
  }
}

// ---- 淹水潛勢（直接 fetch，CORS OK）----
async function fetchFlood(lat, lng) {
  try {
    // Layer 116 = 24小時 650mm 最嚴峻情境
    const url = `https://maps.wra.gov.tw/arcgis/rest/services/WMS/GIC_WMS/MapServer/116/query` +
      `?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326` +
      `&spatialRel=esriSpatialRelIntersects&outFields=flood_dept,Class` +
      `&returnGeometry=false&f=json`;
    const r = await fetch(url);
    const data = await r.json();
    const feat = data?.features?.[0]?.attributes;
    if (!feat) {
      setGeoVal('flood', '無潛勢', 'geo-low');
      return;
    }
    const classMap = {
      1: ['淹水 0.3–0.5m', 'geo-mid'],
      2: ['淹水 0.5–1.0m', 'geo-mid'],
      3: ['淹水 1.0–2.0m', 'geo-high'],
      4: ['淹水 2.0–3.0m', 'geo-high'],
      5: ['淹水 >3.0m',    'geo-high'],
    };
    const [label, cls] = classMap[feat.Class] || [`淹水 ${feat.flood_dept}`, 'geo-mid'];
    setGeoVal('flood', label, cls);
  } catch {
    setGeoVal('flood', '無法查詢', 'geo-none');
  }
}

// ---- 活動斷層（直接 fetch，CORS OK；本地計算最近距離）----
const FAULT_CACHE_KEY = 'hs_fault_cache';
const FAULT_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 天

async function getFaultGeoJSON() {
  const res = await new Promise(r => chrome.storage.local.get(FAULT_CACHE_KEY, r));
  const cached = res[FAULT_CACHE_KEY];
  if (cached && (Date.now() - cached.ts) < FAULT_CACHE_TTL) return cached.data;
  const resp = await fetch('https://www.geologycloud.tw/api/v1/ActiveFault?all=true');
  const data = await resp.json();
  chrome.storage.local.set({ [FAULT_CACHE_KEY]: { data, ts: Date.now() } });
  return data;
}

function haversineDist(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return haversineDist(py, px, ay, ax);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return haversineDist(py, px, ay + t * dy, ax + t * dx);
}

async function fetchFault(lat, lng) {
  try {
    const geojson = await getFaultGeoJSON();
    let minDist = Infinity, nearestName = '', nearestType = '';
    for (const feat of geojson.features || []) {
      const coords = feat.geometry?.coordinates;
      if (!coords) continue;
      // 支援 LineString 與 MultiLineString
      const lines = feat.geometry.type === 'MultiLineString' ? coords : [coords];
      for (const line of lines) {
        for (let i = 0; i < line.length - 1; i++) {
          const [ax, ay] = line[i], [bx, by] = line[i + 1];
          const d = pointToSegmentDist(lng, lat, ax, ay, bx, by);
          if (d < minDist) {
            minDist = d;
            nearestName = feat.properties?.Name || '';
            nearestType = feat.properties?.Type || '';
          }
        }
      }
    }
    if (minDist === Infinity) { setGeoVal('fault', '無資料', 'geo-none'); return; }
    const km = (minDist / 1000).toFixed(1);
    const label = nearestName ? `${km} km（${nearestName}）` : `${km} km`;
    const cls = minDist < 1000 ? 'geo-high' : minDist < 3000 ? 'geo-mid' : 'geo-low';
    setGeoVal('fault', label, cls);
  } catch {
    setGeoVal('fault', '無法查詢', 'geo-none');
  }
}

// ============================================================
// 價格分析（社區成交行情 + 貸款試算）
// ============================================================
let marketFetched = false;
let _loanRatio = 0.7;   // 七成
let _loanYears = 30;
let _loanRate  = 0.025; // 2.5%

function setupMarketToggle() {
  const toggle = document.getElementById('btn-market-toggle');
  const body   = document.getElementById('market-body');
  const arrow  = document.getElementById('market-arrow');
  if (!toggle || !body) return;
  toggle.addEventListener('click', () => {
    const isOpen = body.classList.toggle('hidden');
    if (arrow) arrow.textContent = isOpen ? '▶' : '▼';
    if (!isOpen && !marketFetched && currentData?.communityId) {
      marketFetched = true;
      fetchMarketPrices(currentData.communityId);
    }
  });
}

function showMarketSection(communityId) {
  marketFetched = false;
  const section = document.getElementById('section-market');
  if (section) section.classList.remove('hidden');
  const content = document.getElementById('market-content');
  if (content) content.innerHTML = '';
  const body = document.getElementById('market-body');
  if (body && !body.classList.contains('hidden')) {
    // 若已展開（重新整理物件），立即 fetch
    marketFetched = true;
    fetchMarketPrices(communityId);
  }
}

function fetchMarketPrices(communityId) {
  const content = document.getElementById('market-content');
  if (content) content.innerHTML = '<div class="market-no-data">查詢中...</div>';
  chrome.runtime.sendMessage(
    { action: 'fetchMarketPrices', communityId },
    (resp) => {
      if (chrome.runtime.lastError || !resp?.success) {
        if (content) content.innerHTML = '<div class="market-no-data">無法取得資料</div>';
        return;
      }
      renderMarketPrices(resp.data);
    }
  );
}

function renderMarketPrices(data) {
  const content = document.getElementById('market-content');
  if (!content) return;

  const items     = data?.items || [];
  const total     = data?.total || items.length;
  const prices    = items.map(i => parseFloat(i.unit_price?.price)).filter(p => p > 0);
  const avgPrice  = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
  const myPrice   = currentData?.specs?.unitPrice   || null;
  const totalPrice = currentData?.specs?.totalPrice || null;
  const communityName = currentData?.communityName  || '';

  // ---- 社區行情區塊 ----
  let marketHtml = '';
  if (items.length) {
    let compareHtml = '';
    if (myPrice && avgPrice) {
      const pct    = ((myPrice - avgPrice) / avgPrice * 100).toFixed(1);
      const absPct = Math.abs(pct);
      if (absPct < 3) {
        compareHtml = `<div class="geo-risk-row">
          <span class="geo-risk-label">本物件單價</span>
          <span class="geo-risk-value">${myPrice} 萬/坪（接近均價）</span>
        </div>`;
      } else {
        const sign = pct > 0 ? '▲ 高估' : '▼ 低估';
        const cls  = pct > 0 ? 'market-overpriced' : 'market-underpriced';
        compareHtml = `<div class="geo-risk-row">
          <span class="geo-risk-label">本物件單價</span>
          <span class="geo-risk-value ${cls}">${myPrice} 萬/坪 ${sign} ${absPct}%</span>
        </div>`;
      }
    } else if (myPrice) {
      compareHtml = `<div class="geo-risk-row">
        <span class="geo-risk-label">本物件單價</span>
        <span class="geo-risk-value">${myPrice} 萬/坪</span>
      </div>`;
    }
    marketHtml = `
      <div class="geo-risk-row">
        <span class="geo-risk-label">歷史成交</span>
        <span class="geo-risk-value">${total} 筆</span>
      </div>
      <div class="geo-risk-row">
        <span class="geo-risk-label">社區均價</span>
        <span class="geo-risk-value">${avgPrice ? avgPrice.toFixed(1) + ' 萬/坪' : '—'}</span>
      </div>
      ${compareHtml}`;
  } else {
    marketHtml = `<div class="market-no-data">查無成交記錄</div>`;
  }

  // ---- 貸款試算區塊（僅售屋有 totalPrice 時顯示） ----
  const loanHtml = totalPrice ? `
    <div class="loan-sep"></div>
    <div class="loan-row">
      <span class="loan-label">成數</span>
      <div class="loan-chips">
        <button class="loan-chip${_loanRatio === 0.6 ? ' active' : ''}" data-ratio="0.6">六成</button>
        <button class="loan-chip${_loanRatio === 0.7 ? ' active' : ''}" data-ratio="0.7">七成</button>
        <button class="loan-chip${_loanRatio === 0.8 ? ' active' : ''}" data-ratio="0.8">八成</button>
      </div>
    </div>
    <div class="loan-row">
      <span class="loan-label">年期</span>
      <div class="loan-chips">
        <button class="loan-chip${_loanYears === 20 ? ' active' : ''}" data-years="20">20年</button>
        <button class="loan-chip${_loanYears === 30 ? ' active' : ''}" data-years="30">30年</button>
      </div>
      <span class="loan-label loan-label-rate">利率</span>
      <div class="loan-chips">
        <button class="loan-chip${_loanRate === 0.02  ? ' active' : ''}" data-rate="0.02">2%</button>
        <button class="loan-chip${_loanRate === 0.025 ? ' active' : ''}" data-rate="0.025">2.5%</button>
        <button class="loan-chip${_loanRate === 0.03  ? ' active' : ''}" data-rate="0.03">3%</button>
      </div>
    </div>
    <div class="loan-result">
      <div class="loan-result-item">
        <span class="loan-result-label">貸款額</span>
        <span class="loan-result-value" id="loan-amount">—</span>
      </div>
      <div class="loan-result-item">
        <span class="loan-result-label">月付</span>
        <span class="loan-result-value loan-result-monthly" id="loan-monthly">—</span>
      </div>
    </div>` : '';

  const sourceHtml = `<div class="market-source">資料來源：內政部實價登錄（經 591 API 取得）${communityName ? '・' + communityName : ''}</div>`;

  content.innerHTML = marketHtml + loanHtml + sourceHtml;

  if (totalPrice) setupLoanCalc(totalPrice);
}

function setupLoanCalc(totalPrice) {
  const content = document.getElementById('market-content');
  if (!content) return;

  content.querySelectorAll('.loan-chip[data-ratio]').forEach(btn => {
    btn.addEventListener('click', () => {
      _loanRatio = parseFloat(btn.dataset.ratio);
      content.querySelectorAll('.loan-chip[data-ratio]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _updateLoanResult(totalPrice);
    });
  });

  content.querySelectorAll('.loan-chip[data-years]').forEach(btn => {
    btn.addEventListener('click', () => {
      _loanYears = parseInt(btn.dataset.years);
      content.querySelectorAll('.loan-chip[data-years]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _updateLoanResult(totalPrice);
    });
  });

  content.querySelectorAll('.loan-chip[data-rate]').forEach(btn => {
    btn.addEventListener('click', () => {
      _loanRate = parseFloat(btn.dataset.rate);
      content.querySelectorAll('.loan-chip[data-rate]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _updateLoanResult(totalPrice);
    });
  });

  _updateLoanResult(totalPrice);
}

function _updateLoanResult(totalPrice) {
  const loanAmt = totalPrice * _loanRatio;                         // 萬
  const P = loanAmt * 10000;                                       // 元
  const r = _loanRate / 12;
  const n = _loanYears * 12;
  const monthly = P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
  const monthlyWan = monthly / 10000;

  const amtEl     = document.getElementById('loan-amount');
  const monthlyEl = document.getElementById('loan-monthly');
  if (amtEl)     amtEl.textContent     = `${Math.round(loanAmt)} 萬`;
  if (monthlyEl) monthlyEl.textContent = `約 ${monthlyWan.toFixed(1)} 萬`;
}

// ============================================================
// 地圖 URL 構建
// ============================================================
function buildMapsUrl(lat, lng, keyword, zoom = 15) {
  const q = encodeURIComponent(`${keyword} 附近`);
  return `https://www.google.com/maps/search/${encodeURIComponent(keyword)}/@${lat},${lng},${zoom}z`;
}

// ============================================================
// 收藏功能
// ============================================================
// 規格取得後，若物件已在收藏則回寫補齊（修復老物件 specs = null 的問題）
function _backfillSpecs(specs) {
  if (!specs || !currentUrl) return;
  const id = urlToId(currentUrl);
  if (!favList.some(f => f.id === id)) return;
  const patch = {
    totalPrice:   specs.totalPrice  || specs.price || undefined,
    unitPrice:    specs.unitPrice   || undefined,
    size:         specs.area        || undefined,
    floor:        specs.floor       || undefined,
    buildingAge:  specs.buildingAge || undefined,
    layout:       specs.layout      || undefined,
    buildingType: specs.kindTxt || specs.shape || undefined,
    direction:    specs.direction   || undefined,
    fitment:      specs.fitment     || undefined,
  };
  // 只寫有值的欄位，避免覆蓋掉使用者手動填寫的資料
  const cleanPatch = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v != null)
  );
  if (Object.keys(cleanPatch).length === 0) return;
  updateFavorite(id, cleanPatch).then(list => {
    favList = list;
    renderCompare();
  });
}

// 降價追蹤：比對最新價格與 priceHistory，有變動則寫入並重繪
function _checkPriceChange(specs) {
  if (!currentUrl) return;
  const id = urlToId(currentUrl);
  const fav = favList.find(f => f.id === id);
  if (!fav) return;
  const currentPrice = specs.totalPrice || specs.price || null;
  if (!currentPrice) return;
  const history = fav.priceHistory || [];
  if (history.length && history.at(-1).price === currentPrice) return; // 未變動
  const newHistory = [...history, { price: currentPrice, date: new Date().toISOString().slice(0, 10) }].slice(-10);
  updateFavorite(id, { priceHistory: newHistory }).then(list => {
    favList = list;
    renderSpecs(specs); // 重繪以顯示 delta
    renderFavorites();
  });
}

async function updateSaveButton() {
  if (!currentData) return;
  const id = urlToId(currentUrl);
  const saved = favList.some(f => f.id === id);
  const btn = document.getElementById('btn-save');
  if (!btn) return;
  btn.classList.toggle('is-saved', saved);
  setText('label-save', saved ? ui.btn_saved.replace('⭐ ','').replace('✅ ','') : ui.btn_save.replace('⭐ ',''));
  btn.innerHTML = saved ? '✅ <span id="label-save">已收藏</span>' : '⭐ <span id="label-save">收藏</span>';
}

async function handleSaveToggle() {
  if (!currentData) return;
  await _specsReady; // 等規格非同步任務完成，避免存入不完整資料
  const id = urlToId(currentUrl);
  const existing = favList.findIndex(f => f.id === id);
  const src = detectSource(currentUrl);

  if (existing >= 0) {
    favList = await removeFavorite(id);
  } else {
    const item = {
      id,
      url:          currentUrl,
      source:       src,
      listingType:  src === 'rent591' ? 'rent' : 'sale',
      name:         currentData.name || currentTabTitle || currentUrl,
      address:      currentData.address || null,
      lat:          currentData.lat,
      lng:          currentData.lng,
      savedAt:      Date.now(),
      // 規格（從 extractor specs 自動填入）
      totalPrice:   currentData.specs?.totalPrice || currentData.specs?.price || null,
      unitPrice:    currentData.specs?.unitPrice  || null,
      size:         currentData.specs?.area       || null,
      floor:        currentData.specs?.floor      || null,
      totalFloor:   null,
      buildingAge:  currentData.specs?.buildingAge || null,
      layout:       currentData.specs?.layout      || null,
      buildingType: currentData.specs?.kindTxt || currentData.specs?.shape || null,
      direction:    currentData.specs?.direction   || null,
      fitment:      currentData.specs?.fitment     || null,
      deposit:      currentData.specs?.deposit     || null,
      rentLabels:   currentData.specs?.labels      || [],
      hasParking:    null,
      managementFee: null,
      communityId:   currentData.communityId   || null,
      // 降價追蹤
      priceHistory: (() => {
        const p = currentData.specs?.totalPrice || currentData.specs?.price || null;
        return p ? [{ price: p, date: new Date().toISOString().slice(0, 10) }] : [];
      })(),
      // 看房管理
      viewingStatus: 'unvisited',
      viewingNote:   '',
      viewingRating: null,
      // POI
      checklist:    {},
      hazards:      {},
      tags:         [],
    };
    favList = await addFavorite(item);
  }

  updateSaveButton();
  renderFavorites();
  renderCompare();
}

// ============================================================
// 通勤距離 chips
// ============================================================
function renderCommuteChips(lat, lng) {
  const container = document.getElementById('commute-chips');
  if (!container) return;
  if (!commutePlaces.length) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }
  container.innerHTML = commutePlaces.map(p => {
    const dist = haversineDist(lat, lng, p.lat, p.lng);
    const label = dist >= 1000
      ? `${(dist / 1000).toFixed(1)}km`
      : `${Math.round(dist)}m`;
    const navUrl = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${p.lat},${p.lng}`;
    return `<a class="commute-chip" href="${navUrl}" target="_blank" title="導航至${p.label}">${p.label} ${label}</a>`;
  }).join('');
  container.classList.remove('hidden');
}

// ============================================================
// 物件規格列渲染
// ============================================================
function renderSpecs(specs) {
  const row = document.getElementById('specs-row');
  if (!row) return;
  if (!specs) { row.classList.add('hidden'); return; }

  // chip(label, type): type = 'price' | 'price-down' | 'price-up' | 'size' | 'default'
  const chips = [];
  const chip = (text, type = 'default') => chips.push({ text, type });

  // 降價追蹤 delta
  const _fav = currentUrl ? favList.find(f => f.id === urlToId(currentUrl)) : null;
  const _hist = _fav?.priceHistory;
  const _delta = (_hist?.length >= 2) ? (_hist.at(-1).price - _hist.at(-2).price) : null;

  if (specs.price) {
    const deltaStr = _delta ? ` ${_delta > 0 ? '↑' : '↓'}${Math.abs(_delta).toLocaleString()}` : '';
    chip(`${specs.price.toLocaleString()} 元/月${deltaStr}`, _delta < 0 ? 'price-down' : _delta > 0 ? 'price-up' : 'price');
  }
  if (specs.totalPrice) {
    const deltaStr = _delta ? ` ${_delta > 0 ? '↑' : '↓'}${Math.abs(_delta)}萬` : '';
    chip(`${specs.totalPrice.toLocaleString()} 萬${deltaStr}`, _delta < 0 ? 'price-down' : _delta > 0 ? 'price-up' : 'price');
  }
  if (specs.unitPrice)   chip(`${specs.unitPrice} 萬/坪`, 'price');
  if (specs.area)        chip(`${specs.area} 坪`, 'size');
  if (specs.layout)      chip(specs.layout);
  if (specs.kindTxt)     chip(specs.kindTxt);
  if (specs.shape)       chip(specs.shape);
  if (specs.buildingAge) chip(`屋齡 ${specs.buildingAge}`);

  // 租屋條件 labels（僅顯示對租客有決策意義的項目）
  const RENT_LABEL_SHOW = new Set(['可養寵物','可開伙','可報稅','租金補貼','拎包入住','隨時可遷入']);
  if (specs.labels?.length) {
    for (const lbl of specs.labels) {
      if (RENT_LABEL_SHOW.has(lbl)) chip(lbl, 'label');
    }
  }

  // 次要資訊：樓層、押金、方位、裝潢（預設收折）
  const extraChips = [];
  if (specs.floor)     extraChips.push({ text: `${specs.floor}F`,  type: 'default' });
  if (specs.deposit)   extraChips.push({ text: specs.deposit,       type: 'default' });
  if (specs.direction) extraChips.push({ text: specs.direction,     type: 'default' });
  if (specs.fitment)   extraChips.push({ text: specs.fitment,       type: 'default' });

  if (!chips.length && !extraChips.length) { row.classList.add('hidden'); return; }

  const makeChipHtml = c =>
    `<span class="spec-chip${c.type !== 'default' ? ` spec-chip--${c.type}` : ''}">${c.text}</span>`;

  let html = chips.map(makeChipHtml).join('');

  if (extraChips.length) {
    const extraHtml = extraChips.map(makeChipHtml).join('');
    html += `<span class="spec-chip spec-chip--more" id="specs-more-btn" title="顯示更多">⋯</span>`;
    html += `<span class="specs-extra hidden">${extraHtml}<span class="spec-chip spec-chip--more" id="specs-less-btn">收起</span></span>`;
  }

  row.innerHTML = html;
  row.classList.remove('hidden');

  if (extraChips.length) {
    row.querySelector('#specs-more-btn')?.addEventListener('click', () => {
      row.querySelector('.specs-extra')?.classList.remove('hidden');
      row.querySelector('#specs-more-btn')?.classList.add('hidden');
    });
    row.querySelector('#specs-less-btn')?.addEventListener('click', () => {
      row.querySelector('.specs-extra')?.classList.add('hidden');
      row.querySelector('#specs-more-btn')?.classList.remove('hidden');
    });
  }
}

// ============================================================
// 自訂 POI 按鈕渲染
// ============================================================
function renderCustomPoiButtons() {
  const section = document.getElementById('section-custom');
  const grid    = document.getElementById('custom-poi-grid');
  if (!section || !grid) return;

  if (!customPoiList.length) {
    grid.innerHTML =
      `<button class="btn-custom-cta" id="btn-custom-cta">＋ 新增自訂地點</button>`;
    const cta = document.getElementById('btn-custom-cta');
    if (cta) cta.onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
    return;
  }

  grid.innerHTML = customPoiList.map(item =>
    `<button class="btn-cat" id="btn-custom-${item.key}">${item.emoji} ${item.label}</button>`
  ).join('');
}

// ============================================================
// Footer
// ============================================================
function setupFooter() {
  const brand = document.getElementById('footer-brand');
  if (brand) {
    brand.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('about.html') });
    });
  }
  const settingsBtn = document.getElementById('btn-settings');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
    });
  }
}

// ============================================================
// DOM Helpers
// ============================================================
function setText(id, text) {
  const el = document.getElementById(id);
  if (el && text != null) el.textContent = text;
}

function show(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id) { document.getElementById(id)?.classList.add('hidden'); }

function on(id, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', handler);
}

function openUrl(url) { chrome.tabs.create({ url }); }

// "12F/12F" → 12（當層）
function _parseFloor(floorName) {
  if (!floorName) return null;
  const m = String(floorName).match(/^(\d+)/);
  return m ? parseInt(m[1]) : null;
}
// "12F/12F" → 12（總樓層）
function _parseTotalFloor(floorName) {
  if (!floorName) return null;
  const m = String(floorName).match(/\/(\d+)/);
  return m ? parseInt(m[1]) : null;
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// 租屋規格補充（MAIN world 注入，ISOLATED world 抓不到 __NUXT__ 時用）
// ============================================================
function fetchRentSpecs() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs?.[0]) { resolve(null); return; }
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          world: 'MAIN',
          func: () => {
            try {
              const nuxt = window.__NUXT__;
              if (!nuxt) return null;

              // 優先從 Pinia store 直接讀取（路徑穩定，資料最完整）
              const ctx = nuxt?.pinia?.['rent-detail-info']?.ctx?._rawValue;
              if (ctx) {
                const gtm = ctx.gtm_detail_data || {};
                const fav = ctx.favData || {};

                // 樓層："24F" → 24
                const floorMatch = String(gtm.floor_name || '').match(/^(\d+)/);
                const floor = floorMatch ? parseInt(floorMatch[1]) : null;

                // 租屋條件 labels（逗號分隔字串 → 陣列）
                const labels = typeof gtm.label_name === 'string'
                  ? gtm.label_name.split(',').map(s => s.trim()).filter(Boolean)
                  : [];

                const price = fav.price ? parseFloat(fav.price) : null;
                const area  = fav.area  ? parseFloat(fav.area)  : null;
                if (price > 0 && area > 0) {
                  return {
                    price,
                    area,
                    layout:  fav.layout  || null,
                    kindTxt: fav.kindTxt || null,
                    address: fav.address || ctx.positionRound?.address || null,
                    floor,
                    deposit: ctx.deposit || null,
                    labels,
                  };
                }
              }

              // Fallback：遍歷 __NUXT__（Pinia 路徑不存在時）
              const seen = new WeakSet();
              function find(obj, d) {
                if (d > 15 || !obj || typeof obj !== 'object') return null;
                if (seen.has(obj)) return null;
                seen.add(obj);
                if ('price' in obj && 'area' in obj) {
                  const p = parseFloat(obj.price), a = parseFloat(obj.area);
                  if (p > 0 && a > 0) {
                    return {
                      price: p, area: a,
                      layout:  obj.layout  || null,
                      kindTxt: obj.kindTxt || null,
                      address: typeof obj.address === 'string' && obj.address.length > 2
                        ? obj.address : null,
                    };
                  }
                }
                for (const k of Object.keys(obj)) {
                  const r = find(obj[k], d + 1);
                  if (r) return r;
                }
                return null;
              }
              return find(nuxt, 0);
            } catch (e) { return null; }
          },
        },
        (results) => {
          resolve(chrome.runtime.lastError ? null : (results?.[0]?.result || null));
        }
      );
    });
  });
}

// ============================================================
// 售屋規格補充（MAIN world 注入，從 window.dataLayer 讀取）
// dataLayer[event==='detail_page_view'] 含：總價(萬)/坪數/單價/屋齡/樓層/建物類型
// ============================================================
function fetchSaleSpecs() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs?.[0]) { resolve(null); return; }
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          world: 'MAIN',
          func: () => {
            try {
              const dl = window.dataLayer;
              if (!Array.isArray(dl)) return null;
              const item = dl.find(d => d.event === 'detail_page_view');
              if (!item) return null;
              const totalPrice = item.price_name    != null ? parseFloat(item.price_name)      : null;
              const area       = item.area_name     != null ? parseFloat(item.area_name)       : null;
              const unitPrice  = item.unit_price_name != null ? parseFloat(item.unit_price_name) : null;
              const buildingAge = item.house_age_name != null ? `${item.house_age_name}年`      : null;
              const floor      = item.floor_name    != null ? item.floor_name                  : null;
              const shape     = item.shape_name     || null;
              const direction = item.direction_name || null;
              const fitment   = item.fitment_name   || null;
              if (!totalPrice && !area) return null;
              return { totalPrice, area, unitPrice, buildingAge, floor, shape, direction, fitment };
            } catch (e) { return null; }
          },
        },
        (results) => {
          resolve(chrome.runtime.lastError ? null : (results?.[0]?.result || null));
        }
      );
    });
  });
}

// ============================================================
// Reverse Geocoding（Nominatim / OpenStreetMap）
// 免費、無需 API key，回傳台灣繁中地址
// 格式：臺北市中正區廈門街123巷10之1號（有門牌）或 臺北市中正區廈門街123巷（無門牌）
// ============================================================
async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=zh-TW`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address;
    if (!a) return null;

    // 組合台灣地址：縣市 + 區 + 路街巷弄 + 門牌（若有）
    const city    = a.city || a.county || a.state || '';
    const dist    = a.suburb || a.town || a.village || '';
    const road    = a.road || a.pedestrian || a.path || '';
    const houseNo = a.house_number || '';

    const addr = `${city}${dist}${road}${houseNo}`.trim();
    return addr.length > 2 ? addr : null;
  } catch (e) {
    return null;
  }
}

// ============================================================
// 啟動
// ============================================================
document.addEventListener('DOMContentLoaded', init);

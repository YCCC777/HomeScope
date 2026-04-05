// ============================================================
// HomeScope — 591 售屋 Extractor
// 目標：sale.591.com.tw/home/house/detail/2/{ID}.html
// 策略（依優先序）：
//   A. Google Maps embed iframe src  → q=(lat),(lng)
//   B. rsMapIframe DOM iframe        → lat=X&lng=Y
//   C. rsMapIframe script template   → inline script 裡的 HTML 字串
//   D. IIFE coord scan               → 連續台灣座標數字對
//   E. 標準 inline script regex
//   F. JSON-LD
// ============================================================

'use strict';

function extract591Sale() {
  const communityId   = _extractCommunityId();
  const communityName = _extractCommunityName();

  // ---- 策略 A：Google Maps embed iframe src ----
  const mapIframe =
    document.querySelector('iframe[src*="maps/embed"]') ||
    document.querySelector('iframe[src*="maps.google"]') ||
    document.querySelector('iframe[src*="google.com/maps"]') ||
    document.querySelector('iframe[src*="google.com.tw/maps"]');

  if (mapIframe) {
    const src = mapIframe.getAttribute('src') || '';
    const m = src.match(/[?&]q=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (isValidCoord(lat, lng)) {
        return {
          lat, lng,
          country:  'TW',
          source:   'sale591',
          strategy: 'iframe-src',
          name:     _cleanSaleTitle(document.title),
          address:  _extractAddressSale(),
          specs:    _extractSpecsSale(),
          communityId, communityName,
        };
      }
    }
  }

  // ---- 策略 B：rsMapIframe → lat=X&lng=Y 格式（591 自家地圖 iframe） ----
  const rsIframe = document.querySelector('iframe[src*="rsMapIframe"]');
  if (rsIframe) {
    const src = rsIframe.getAttribute('src') || '';
    const latM = src.match(/[?&]lat=(-?\d{1,3}\.\d+)/);
    const lngM = src.match(/[?&]lng=(-?\d{1,3}\.\d+)/);
    if (latM && lngM) {
      const lat = parseFloat(latM[1]);
      const lng = parseFloat(lngM[1]);
      if (isValidCoord(lat, lng)) {
        return {
          lat, lng,
          country:  'TW',
          source:   'sale591',
          strategy: 'rsmap-iframe',
          name:     _cleanSaleTitle(document.title),
          address:  _extractAddressSale(),
          specs:    _extractSpecsSale(),
          communityId, communityName,
        };
      }
    }
  }

  // ---- 策略 C：inline script 裡的 rsMapIframe template 字串 ----
  // 座標以 HTML template 形式嵌在 script 裡：rsMapIframe?lat=25.02&lng=121.51
  const rsScript = _extractFromRsMapScript();
  if (rsScript) {
    return {
      lat:      rsScript.lat,
      lng:      rsScript.lng,
      country:  'TW',
      source:   'sale591',
      strategy: 'rsmap-script',
      name:     _cleanSaleTitle(document.title),
      address:  _extractAddressSale(),
      specs:    _extractSpecsSale(),
      communityId, communityName,
    };
  }

  // ---- 策略 D：IIFE argument list 台灣座標數字對（ISOLATED world 可用） ----
  // 與 rent 頁相同：座標可能在 inline script 的 IIFE args 中
  const iife = _extractTwCoordFromIIFE();
  if (iife) {
    return {
      lat:      iife.lat,
      lng:      iife.lng,
      country:  'TW',
      source:   'sale591',
      strategy: 'iife-coord',
      name:     _cleanSaleTitle(document.title),
      address:  _extractAddressSale(),
      specs:    _extractSpecsSale(),
      communityId, communityName,
    };
  }

  // ---- 策略 E：標準 inline script regex ----
  const inlineResult = extractFromInlineScripts();
  if (inlineResult && isValidCoord(inlineResult.lat, inlineResult.lng)) {
    return {
      ...inlineResult,
      country: 'TW',
      source:  'sale591',
      name:    _cleanSaleTitle(document.title),
      address: _extractAddressSale(),
      specs:   _extractSpecsSale(),
      communityId, communityName,
    };
  }

  // ---- 策略 F：JSON-LD ----
  const jsonldResult = extractFromJsonLd();
  if (jsonldResult && isValidCoord(jsonldResult.lat, jsonldResult.lng)) {
    return {
      ...jsonldResult,
      country: 'TW',
      source:  'sale591',
      name:    jsonldResult.name || _cleanSaleTitle(document.title),
      address: _extractAddressSale(),
      specs:   _extractSpecsSale(),
      communityId, communityName,
    };
  }

  return null;
}

// ---- rsMapIframe template 字串掃描 ----
// 座標嵌在 inline script 的 HTML 字串中，而非真實 DOM iframe
// 格式：rsMapIframe?lat=25.0228728&lng=121.5180963
function _extractFromRsMapScript() {
  const RE = /rsMapIframe\?[^"']*lat=(-?\d{1,3}\.\d+)[^"']*&lng=(-?\d{1,3}\.\d+)/;
  const scripts = document.querySelectorAll('script:not([src])');
  for (const s of scripts) {
    const m = s.textContent.match(RE);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (isValidCoord(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

// ---- IIFE argument list 台灣座標數字對 ----
function _extractTwCoordFromIIFE() {
  const RE = /\b(2[1-6]\.\d{4,}),(1(?:19|2[0-2])\.\d{4,})\b/;
  const scripts = document.querySelectorAll('script:not([src])');
  for (const s of scripts) {
    const text = s.textContent;
    if (text.length > 8_000_000) continue;
    const m = text.match(RE);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (isValidCoord(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

// ---- 售屋規格提取（DOM 選擇器，CSS 混淆欄位跳過） ----
// DOM 結構：.info-floor-left-2 > .info-floor-key-2（值）+ .info-floor-value（標籤）
// 可讀欄位：格局（如 2房1廳1衛1陽台）、屋齡（如 19年）
// CSS 混淆欄位（無法讀取）：坪數、總價、單價
function _extractSpecsSale() {
  try {
    const items = {};
    document.querySelectorAll('.info-floor-left-2').forEach(container => {
      const keyEl = container.querySelector('.info-floor-key-2');
      const valEl = container.querySelector('.info-floor-value');
      if (!keyEl || !valEl) return;
      const value = keyEl.textContent.trim();
      const label = valEl.textContent.trim();
      if (label && value) items[label] = value;
    });
    const layout      = items['格局']  || null;
    const buildingAge = items['屋齡']  || null;
    if (!layout && !buildingAge) return null;
    return { layout, buildingAge };
  } catch (e) { return null; }
}

// ---- helpers ----
function _cleanSaleTitle(title) {
  return (title || '')
    .replace(/\s*[-–—|｜]\s*591.*$/i, '')
    .trim();
}

function _extractAddressSale() {
  // 591 售屋頁用 CSS 控制字元顯示順序（anti-scraping），
  // textContent 拿到的字元順序與視覺不符，直接回傳 null 避免亂碼
  return null;
}

function _extractCommunityId() {
  const el = document.getElementById('hid_communityId');
  return el ? (parseInt(el.value) || null) : null;
}

function _extractCommunityName() {
  const el = document.querySelector('[community-name]');
  return el?.getAttribute('community-name') || null;
}

window.__siteExtractFn = extract591Sale;

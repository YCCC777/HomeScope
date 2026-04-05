// ============================================================
// HomeScope — 591 租屋 Extractor
// 目標：rent.591.com.tw/{數字ID}
// 技術：Nuxt/Vue SPA，座標在 window.__NUXT__ IIFE 參數中
// 注意：591 的 __NUXT__ 是 IIFE minified，座標以變數名出現
//       (如 lat:ca,lng:cb)，數字才在 argument list 尾端
//       → extractFromInlineScripts() 的 regex 不適用
// 策略 A（MAIN world）：直接遍歷 window.__NUXT__ 物件取值
// 策略 B（ISOLATED world）：regex 找台灣座標範圍數字對
// ============================================================

'use strict';

function extract591Rent() {
  // 過濾非詳情頁，避免在列表頁觸發（列表頁 URL 如 /house/, /region/ 等）
  const path = location.href.split('?')[0];
  if (!/rent\.591\.com\.tw\/\d+$/.test(path)) return null;

  // 策略 A：MAIN world 直接讀取 window.__NUXT__ 物件（popup.js fallback 會以 MAIN world 執行）
  const nuxtObj = _extractFromNuxtObject();
  if (nuxtObj) {
    return {
      lat:      nuxtObj.lat,
      lng:      nuxtObj.lng,
      country:  'TW',
      source:   'rent591',
      strategy: 'nuxt-object',
      name:     _cleanRentTitle(document.title),
      address:  nuxtObj.address || null,
      specs:    nuxtObj.specs   || null,
    };
  }

  // 策略 B：IIFE argument list 裡的台灣座標數字對
  //   591 Nuxt 腳本：window.__NUXT__=(function(...,ca,cb,...){lat:ca,lng:cb})(...,25.03,121.53,...)
  //   → 在 script 文字中找連續的「台灣緯度,台灣經度」
  const iife = _extractTwCoordFromIIFE();
  if (iife) {
    return {
      lat:      iife.lat,
      lng:      iife.lng,
      country:  'TW',
      source:   'rent591',
      strategy: 'iife-coord',
      name:     _cleanRentTitle(document.title),
      address:  _extractAddressRent(),
    };
  }

  // 策略 C：標準 inline script regex（若 591 改版回字面值格式則有效）
  const inlineResult = extractFromInlineScripts();
  if (inlineResult && isValidCoord(inlineResult.lat, inlineResult.lng)) {
    return {
      ...inlineResult,
      country:  'TW',
      source:   'rent591',
      name:     _cleanRentTitle(document.title),
      address:  _extractAddressRent(),
    };
  }

  // 策略 D：JSON-LD
  const jsonldResult = extractFromJsonLd();
  if (jsonldResult && isValidCoord(jsonldResult.lat, jsonldResult.lng)) {
    return {
      ...jsonldResult,
      country: 'TW',
      source:  'rent591',
      name:    jsonldResult.name || _cleanRentTitle(document.title),
      address: _extractAddressRent(),
    };
  }

  // 策略 E：meta 標籤
  const metaResult = extractFromMetaTags();
  if (metaResult && isValidCoord(metaResult.lat, metaResult.lng)) {
    return {
      ...metaResult,
      country: 'TW',
      source:  'rent591',
      name:    _cleanRentTitle(document.title),
      address: _extractAddressRent(),
    };
  }

  return null;
}

// ---- 策略 A：遍歷 window.__NUXT__ 物件（MAIN world 限定） ----
function _extractFromNuxtObject() {
  try {
    const nuxt = window.__NUXT__;
    if (!nuxt || typeof nuxt !== 'object') return null;

    let coords = null;
    let specs  = null;
    const seen = new WeakSet();

    function traverse(obj, depth) {
      if (depth > 15 || !obj || typeof obj !== 'object') return;
      if (seen.has(obj)) return;
      seen.add(obj);

      // 找座標
      if (!coords && 'lat' in obj && 'lng' in obj) {
        const lat = parseFloat(obj.lat);
        const lng = parseFloat(obj.lng);
        if (isValidCoord(lat, lng)) {
          coords = { lat, lng };
        }
      }

      // 找物件規格（price + area 同時存在；實測 key 名稱）
      // 物件：{ price, area, layout, address, title, kindTxt, ... }
      // 注意：591 rent __NUXT__ 在此層級不含屋齡/樓層，這兩個欄位本來就不在資料裡
      if (!specs && 'price' in obj && 'area' in obj) {
        const price = parseFloat(obj.price);
        const area  = parseFloat(obj.area);
        if (price > 0 && area > 0) {
          specs = {
            price,                                        // 月租（元）
            area,                                         // 坪數
            layout:  obj.layout  || null,                 // "4房2廳2衛"
            kindTxt: obj.kindTxt || null,                 // "整層住家"
            address: typeof obj.address === 'string' && obj.address.length > 2
              ? obj.address : null,                       // 真實地址（比 Nominatim 快）
          };
        }
      }

      if (coords && specs) return; // 找到全部，提早結束

      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (val && typeof val === 'object') traverse(val, depth + 1);
        if (coords && specs) return;
      }
    }

    traverse(nuxt, 0);
    if (!coords) return null;
    // specs.address 比 Nominatim 快，優先用
    return { ...coords, address: specs?.address || null, specs };
  } catch (e) {}
  return null;
}

// ---- 策略 B：IIFE argument list 台灣座標數字對（ISOLATED world 可用） ----
// 格式：window.__NUXT__=(function(...){...})(..., 25.0344315, 121.5301514, ...)
// 正規：台灣緯度(21-26)直接接逗號再接台灣經度(119-122)
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

// ---- helpers ----
function _cleanRentTitle(title) {
  return (title || '')
    .replace(/\s*[-–—]\s*591租屋網.*$/i, '')
    .replace(/\s*\|\s*591.*$/i, '')
    .trim();
}

function _extractAddressRent() {
  // 591 租屋頁同樣有 CSS 字元順序混淆，DOM 抓到的地址字元順序不可信
  // address 由 _extractFromNuxtObject() 從 __NUXT__ 物件取得（MAIN world），
  // 若無則回傳 null，避免顯示亂碼
  return null;
}

window.__siteExtractFn = extract591Rent;

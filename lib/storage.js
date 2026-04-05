// ============================================================
// HomeScope — Storage Layer
// 策略：sync + local 雙寫，讀取時合併去重（取最新 savedAt）
// sync 限 100KB，超出時繼續寫 local 保底
// key 前綴用 hs_ 避免與 StayScope 衝突
//
// 收藏 Schema:
// {
//   id, url, source ('rent591'|'sale591'), listingType ('rent'|'sale'),
//   name, address, lat, lng, savedAt,
//   totalPrice, unitPrice, size, floor, totalFloor,
//   buildingAge, hasParking, managementFee,
//   viewingStatus ('unvisited'|'scheduled'|'visited'),
//   viewingNote, viewingRating (1-5|null),
//   checklist: { transit, supermarket, convenience, school, hospital, park, bank },
//   hazards: { temple, funeral, columbarium, ktv, gasStation, powerTower },
//   tags: [],
// }
// ============================================================
'use strict';

const FAVORITES_KEY  = 'hs_favorites';
const HISTORY_KEY    = 'hs_history';
const HISTORY_MAX    = 20;
const COMPARE_SEL_KEY = 'hs_compare_selection';

// ---- 內部：同時讀取 sync + local，合併後去重 ----
function _getMergedFavorites() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(FAVORITES_KEY, (syncResult) => {
      const syncList = (chrome.runtime.lastError ? [] : syncResult[FAVORITES_KEY]) || [];
      chrome.storage.local.get(FAVORITES_KEY, (localResult) => {
        const localList = (localResult[FAVORITES_KEY]) || [];
        const map = new Map();
        for (const item of [...localList, ...syncList]) {
          const existing = map.get(item.id);
          if (!existing || (item.savedAt || 0) > (existing.savedAt || 0)) {
            map.set(item.id, item);
          }
        }
        const merged = [...map.values()].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
        resolve(merged);
      });
    });
  });
}

function getFavorites() {
  return _getMergedFavorites();
}

function setFavorites(list) {
  return new Promise((resolve) => {
    const payload = { [FAVORITES_KEY]: list };
    chrome.storage.local.set(payload, () => {
      chrome.storage.sync.set(payload, () => {
        if (chrome.runtime.lastError) {
          console.warn('[HomeScope] sync quota exceeded, local only');
        }
        resolve();
      });
    });
  });
}

async function addFavorite(item) {
  const list = await getFavorites();
  const existing = list.findIndex(f => f.id === item.id);
  if (existing >= 0) {
    list[existing] = item;
  } else {
    list.unshift(item);
  }
  await setFavorites(list);
  return list;
}

async function removeFavorite(id) {
  const list = await getFavorites();
  const updated = list.filter(f => f.id !== id);
  await setFavorites(updated);
  return updated;
}

async function updateFavorite(id, patch) {
  const list = await getFavorites();
  const idx = list.findIndex(f => f.id === id);
  if (idx < 0) return list;
  list[idx] = { ...list[idx], ...patch };
  await setFavorites(list);
  return list;
}

async function isFavorited(id) {
  const list = await getFavorites();
  return list.some(f => f.id === id);
}

// ---- 幫助函式：從 URL 生成穩定 ID（djb2 hash）----
function urlToId(url) {
  let u;
  try { u = new URL(url); } catch { return url.slice(-32); }
  const key = u.hostname + u.pathname;
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h) ^ key.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(36);
}

// ---- 瀏覽歷史 ----
function addHistory(item) {
  return new Promise((resolve) => {
    chrome.storage.local.get(HISTORY_KEY, (result) => {
      let list = result[HISTORY_KEY] || [];
      list = list.filter(h => h.id !== item.id);
      list.unshift({ ...item, visitedAt: Date.now() });
      if (list.length > HISTORY_MAX) list = list.slice(0, HISTORY_MAX);
      chrome.storage.local.set({ [HISTORY_KEY]: list }, () => resolve(list));
    });
  });
}

function getHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get(HISTORY_KEY, (result) => {
      resolve(result[HISTORY_KEY] || []);
    });
  });
}

function clearHistory() {
  return new Promise((resolve) => chrome.storage.local.remove(HISTORY_KEY, resolve));
}

// ---- 自訂 POI ----
// schema: [{ key, emoji, label, keyword }]
const CUSTOM_POI_KEY = 'hs_custom_poi';

function getCustomPoi() {
  return new Promise(resolve => {
    chrome.storage.local.get(CUSTOM_POI_KEY, r => resolve(r[CUSTOM_POI_KEY] || []));
  });
}

function saveCustomPoi(list) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [CUSTOM_POI_KEY]: list }, resolve);
  });
}

// ---- 常去地點 ----
const COMMUTE_KEY = 'hs_commute_places';

function getCommutePlaces() {
  return new Promise(resolve => {
    chrome.storage.local.get(COMMUTE_KEY, r => resolve(r[COMMUTE_KEY] || []));
  });
}

function saveCommutePlaces(list) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [COMMUTE_KEY]: list }, resolve);
  });
}

// ---- 比較選取 ID ----
function setCompareSelection(ids) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [COMPARE_SEL_KEY]: ids }, resolve);
  });
}

function getCompareSelection() {
  return new Promise((resolve) => {
    chrome.storage.local.get(COMPARE_SEL_KEY, (r) => resolve(r[COMPARE_SEL_KEY] || []));
  });
}

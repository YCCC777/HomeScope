# HomeScope — CLAUDE.md

> Chrome 擴充功能：在 591 租屋/售屋物件頁面，一鍵查看周邊生活機能 + 嫌惡設施，支援看房管理與比較。
> 從 StayScope 衍生的台灣房地產版本，獨立插件。

---

## 專案概覽

| 項目 | 值 |
|------|-----|
| 名稱 | HomeScope |
| 版本 | v1.0.0（Phase 1 MVP） |
| Manifest | MV3（Service Worker） |
| 架構 | 零建構、vanilla JS |
| 支援平台 | rent.591.com.tw（Nuxt/Vue）、sale.591.com.tw（舊版靜態/JS渲染） |
| 語系 | 只有 zh-TW（台灣在地產品） |
| 主色調 | 台灣青綠 `#30D196`（StayScope 是珊瑚橘） |
| Storage 前綴 | `hs_`（StayScope 用 `ss_`，可同時安裝不衝突） |

---

## 檔案架構

```
HomeScope/
├── manifest.json
├── background.js          # Badge 狀態管理（✓/!）
├── content.js             # 入口：呼叫 extractor → 快取 → SPA 偵測（2s delay）
├── extractors/
│   ├── base.js            # 直接從 StayScope 複製，零修改
│   ├── 591rent.js         # 三策略：NUXT物件遍歷 / IIFE數字對 / 標準regex
│   └── 591sale.js         # 六策略：Maps iframe / rsMapIframe DOM / rsMapIframe script / IIFE / inline / JSON-LD
├── lib/
│   └── storage.js         # hs_ 前綴；HomeScope schema；無 price log
├── i18n/
│   └── locales.js         # 只有 zh-TW；TW_POI_KEYWORDS（含嫌惡設施）
├── popup.html             # 三頁籤（搜尋/看房清單/比較）
├── popup.js               # 全域狀態；591 偵測；link-out 按鈕
├── popup.css              # 暗色主題 + 青綠 accent + 嫌惡設施橙/紅
├── popup-favorites.js     # 看房清單：viewingStatus + checklist + hazards + 筆記
├── popup-compare.js       # 比較頁：規格 strip + 物件卡（筆記/標籤/POI）+ 複製結果
├── popup-history.js       # 瀏覽歷史（直接從 StayScope 複製，小改）
├── settings.html/js/css   # 設定頁（自訂 POI + 常去地點通勤設定）
├── about.html/css         # 品牌頁（功能亮點、使用說明、更新日誌）← footer 點擊開啟
└── CLAUDE.md
```

---

## 591 座標提取策略

### rent.591.com.tw（Nuxt SPA）

**關鍵陷阱**：591 的 `window.__NUXT__` 是 IIFE minified 格式：
```js
window.__NUXT__=(function(...,ca,cb,...){ return {..., lat:ca, lng:cb, ...} })(..., 25.03, 121.53, ...)
```
座標以**變數名**出現（`lat:ca`），數字只在 argument list 尾端。
→ `extractFromInlineScripts()` 的 `lat:數字` regex **永遠不會命中**。

**三個策略（依優先序）**：

| 策略 | 適用環境 | 方法 |
|------|---------|------|
| A. `_extractFromNuxtObject()` | MAIN world | 直接遍歷 `window.__NUXT__` JS 物件找 `{lat, lng}` |
| B. `_extractTwCoordFromIIFE()` | ISOLATED world | regex 找連續台灣座標數字對 `(2[1-6]\.{4,}),(1(?:19|2[0-2])\.{4,})` |
| C. `extractFromInlineScripts()` | ISOLATED world | base.js 標準 regex（若 591 改版則有效） |

### sale.591.com.tw（靜態/JS 混合頁）

**關鍵陷阱**：WebFetch 拿到的 SSR HTML 有 Google Maps iframe，但**瀏覽器實際執行的頁面沒有**。座標在 inline script 的 HTML **template 字串**裡：
```html
<!-- 這行在 <script> 的字串裡，不是真實 DOM iframe -->
<iframe src="/home/map/rsMapIframe?lat=25.0228728&lng=121.5180963&...">
```

**六個策略（依優先序）**：

| 策略 | 方法 |
|------|------|
| A. Google Maps embed iframe DOM | `querySelector('iframe[src*="maps/embed"]')` → `q=lat,lng` |
| B. rsMapIframe DOM | `querySelector('iframe[src*="rsMapIframe"]')` → `lat=X&lng=Y` |
| C. rsMapIframe script template | 掃 inline script 文字找 `rsMapIframe?lat=X&lng=Y` ← **主要命中策略** |
| D. IIFE coord scan | 連續台灣座標數字對 regex |
| E. 標準 inline script regex | base.js `extractFromInlineScripts()` |
| F. JSON-LD | `extractFromJsonLd()` |

### MAIN world fallback（通用）
popup.js `queryActiveTab()` 在 content.js 失敗後，用 `world: 'MAIN'` 重新注入 extractor。
→ 策略 A（`_extractFromNuxtObject`）在此環境有效，可直接存取 `window.__NUXT__`。

---

## 地址提取策略

### 591 CSS Anti-Scraping（已確認無法繞過）
591 使用 CSS 字元順序混淆：DOM 字元排列順序與視覺顯示不同，靠 CSS 控制渲染。
`textContent` 拿到的是 DOM 順序（如 `建工9區2灣民街中5三號`），無法使用。

完整偵測（inline script / window 變數 / JSON-LD / meta tag / data-* 屬性）全數為空，
地址**只存在於 CSS 渲染層**，JS 無法取得，為刻意設計，無法繞過。

### 售屋規格 — window.dataLayer（已確認可用）
sale.591.com.tw 透過 GTM 將物件資料推入 `window.dataLayer`，其中 `event === 'detail_page_view'` 的項目包含：

| dataLayer key | 內容 | 對應 schema |
|---------------|------|------------|
| `price_name` | 總價（萬） | `totalPrice` |
| `area_name` | 坪數 | `area` |
| `unit_price_name` | 萬/坪（已算好） | `unitPrice` |
| `house_age_name` | 屋齡（年，數字） | `buildingAge` |
| `floor_name` | 所在樓層（數字） | `floor` |
| `shape_name` | 建物類型（如「電梯大樓」） | `shape` |
| `layout_name` | 房數（數字，無廳衛） | — |

**注意**：`layout_name` 只有數字，完整格局字串（如 "2房1廳1衛1陽台"）仍需從 DOM `.info-floor-left-2 > 格局` 取得。
**`window.dataLayer` 是頁面 JS 全域變數，只有 MAIN world 可存取**，需用 `fetchSaleSpecs()` 注入。

規格合併策略（`popup.js handleResponse`）：
1. content script（ISOLATED world）→ `_extractSpecsSale()` → DOM layout 字串
2. `fetchSaleSpecs()`（MAIN world）→ dataLayer → 價格/坪數/單價/屋齡/樓層/建物類型
3. `Object.assign({}, domSpecs, dlSpecs, { layout: domSpecs.layout })` 合併，格局字串保留 DOM 版

### Reverse Geocoding（現行解法）
**使用 Nominatim（OpenStreetMap）**：免費、無需 API key、回傳繁中地址。

流程：
1. Extractor 提取 lat/lng
2. `_extractAddressRent()` / `_extractAddressSale()` 回傳 `null`（不碰 DOM）
3. `handleResponse()` 偵測 address 為 null → 非同步呼叫 `reverseGeocode(lat, lng)`
4. Nominatim 回傳後更新 `currentData.address` 並即時更新 UI

地址組合格式（`popup.js` `reverseGeocode()`）：
```
${city}${suburb}${road}${house_number}
```
範例：`臺北市中正區廈門街123巷10之1號`（有門牌）/ `臺北市中正區廈門街123巷`（無門牌）

**覆蓋率**：市區大樓通常有門牌；郊區或較舊社區可能只有路名。
**Nominatim 使用限制**：1 req/sec（個人插件用量完全無問題），需 manifest `host_permissions` 含 `https://nominatim.openstreetmap.org/*`。
**凶宅搜尋**：`currentData.address` 更新後，凶宅 Google 搜尋自動帶入正確地址。

---

## 收藏 Schema

```javascript
{
  // 識別
  id,              // urlToId(url) — djb2 hash
  url,             // 591 物件 URL
  source,          // 'rent591' | 'sale591'
  listingType,     // 'rent' | 'sale'（從 source 推導）
  savedAt,

  // 基本
  name, address, lat, lng,

  // 物件規格（Phase 2 自動提取，Phase 1 空值）
  totalPrice,      // 租屋=月租(元)，售屋=總價(萬)
  unitPrice,       // 售屋=萬/坪；租屋=null
  size, floor, totalFloor, buildingAge, hasParking, managementFee,

  // 看房管理（HomeScope 核心功能）
  viewingStatus,   // 'unvisited' | 'scheduled' | 'visited'
  viewingNote,     // 看房筆記（自由文字）
  viewingRating,   // 1-5 | null

  // 正向 POI（三態：true/false/undefined）
  checklist: { transit, supermarket, convenience, school, junior, hospital, park, bank, mcdonalds, starbucks },

  // 嫌惡設施（語義反轉：true=有此設施=壞；false=確認無=好）
  hazards: { temple, funeral, columbarium, ktv, gasStation, powerTower, garbage },

  tags,  // string[]
}
```

---

## POI 關鍵字（台灣）

### 正向 POI
| key | Google Maps 搜尋字 |
|-----|-------------------|
| transit | 捷運站 |
| supermarket | 全聯 |
| convenience | 便利商店 |
| school | 國小 |
| junior | 國中 |
| hospital | 醫院 |
| park | 公園 |
| bank | 銀行 |
| mcdonalds | 麥當勞 |
| starbucks | 星巴克 |

### 嫌惡設施
| key | 搜尋字 | 備注 |
|-----|--------|------|
| temple | 宮廟 | |
| funeral | 殯儀館 | |
| columbarium | 納骨塔 | |
| ktv | **小吃部KTV** | 用戶實測：此關鍵字比「小吃部」更精準找到特種行業 |
| gasStation | 加油站 | |
| powerTower | 高壓電塔 | |
| garbage | **資源回收場&垃圾場** | `&` 連接兩個關鍵字同時搜尋 |

---

## Link-out 按鈕

| 按鈕 | 目標 | 備注 |
|------|------|------|
| 凶宅查詢 | `google.com/search?q=${address} 凶宅` | 法律風險：不在插件內顯示判斷；address 由 Nominatim reverse geocode 提供（含門牌） |
| 實價登錄 | `lvr.land.moi.gov.tw/jsp/list.jsp` | 政府網站用 POST form，無 GET 參數，只能開到查詢頁手動輸入 |

---

## CSS 主題變數

```css
:root {
  --bg:         #1C1C1E;
  --surface:    #2C2C2E;
  --surface-2:  #3A3A3C;
  --accent:     #30D196;   /* 台灣青綠（主色，StayScope 是珊瑚橘） */
  --gold:       #FFD60A;   /* 收藏頁 */
  --blue:       #5AC8FA;   /* 比較頁 */
  --green:      #34C759;
  --danger:     #FF453A;
  --warn:       #FF9F0A;   /* 嫌惡設施區塊 header */
  --hazard:     #FF453A;   /* 嫌惡設施 confirmed（有設施）*/
  --text-1:     #F5F5F7;
  --text-2:     #C0C0C4;
  --text-3:     #8E8E93;
  --border:     rgba(255,255,255,0.12);
}
```

---

## 重要設計決策

### ✅ 嫌惡設施語義反轉
- checklist: `true` = 有此機能 = 好事 → 顯示綠色
- hazards:   `true` = 有此設施 = 壞事 → 顯示橙/紅色
- 三態循環：`undefined → true → false → undefined`
- UI class 用 `state-has`（壞）vs `state-none`（確認無，好）

### ✅ 凶宅 link-out（不在插件內顯示判斷）
- 法律風險：若資料錯誤對屋主造成損害
- 做法：Google 搜尋「物件名稱 凶宅」讓使用者自行判斷

### ✅ 實價登錄 link-out（Phase 1），API（Phase 3）
- 內政部 `lvr.land.moi.gov.tw` 用 POST form，Phase 1 只能開到查詢頁
- 內政部 API 免費，Phase 3 再整合

### ✅ 看房筆記保留（StayScope 移除但 HomeScope 必要）
- 實體看房後需要記錄採光/氣味/鄰居印象等

### ✅ 「小吃部KTV」關鍵字
- 用戶實測此關鍵字在 Google Maps 可精準找到特種行業
- 不要改成「小吃部」或「KTV」單獨搜尋

### ❌ price log（從 StayScope 移除）
- 房地產物件價格不像旅遊短租每天波動
- Phase 2 可考慮「降價追蹤」但用不同邏輯

### ❌ DOM 地址提取（已確認無法實作）
- 591 使用 CSS 字元順序混淆（anti-scraping），`textContent` 拿到的順序錯誤
- 已完整偵測：inline script / window 變數 / JSON-LD / meta tag / data-* 屬性，**全部無地址資料**
- 地址只存在於 CSS 渲染層，JS 無法取得，這是刻意設計，無法繞過
- 目前 address 欄：租屋由 `__NUXT__` 物件提供（若有）；售屋固定為 null

---

## 關鍵陷阱

1. **rent.591 content_scripts 寬鬆 pattern**：extractor 第一行必須 URL 過濾，否則在列表頁觸發
2. **Nuxt hydration delay**：content.js 初始延遲 2000ms（StayScope 是 1000ms）
3. **storage key 前綴**：一律用 `hs_` 避免與 StayScope 的 `ss_` 衝突
4. **hazards 語義反轉**：CSS class 和條件判斷都要記得是反的
5. **IIFE minification**：591 Nuxt 腳本的座標是 IIFE 參數，`extractFromInlineScripts()` 無效，需用 `_extractFromNuxtObject()`（MAIN world）或 `_extractTwCoordFromIIFE()`（ISOLATED world）
6. **rsMapIframe 不是真實 DOM element**：售屋頁的地圖 URL 是 inline script 字串，需掃 script 文字而非 `querySelector`
7. **WebFetch vs 瀏覽器差異**：WebFetch 拿到 SSR HTML（有 Google Maps iframe），瀏覽器執行 JS 後 DOM 完全不同（無該 iframe）

---

## 比較頁設計（popup-compare.js）

### 結構
1. **上層：規格對比 Strip**（`.cmp-strip`）
   - 橫排標頭 A/B/C/D/E，每欄寬度自動均分（360px 下最多 5 欄）
   - 依序顯示（有值才顯示該列）：月租/總價、管理費、單價、坪數、屋齡、樓層、格局
   - 最優值標示：最低單價/最低總價 → 綠色；最大坪數 → 綠色
   - 屋齡 ≥ 35 年 → 橙色 + ⚠（部分銀行貸款成數偏低）
   - 租售混選時頂部提示，且價格/單價不做最優標示（單位不同）
2. **下層：物件卡**（`.compare-card`）
   - 物件名 + 來源 + 看房狀態 + 評分 + 地圖/連結按鈕
   - 看房筆記前 55 字摘要（斜體灰色）
   - 標籤 chips
   - 確認的 POI + 嫌惡設施 chips

### 注意事項
- 環境風險（液化/淹水/斷層）**不存在 favorites schema**，比較頁無法顯示（live fetch only）
- 規格資料依賴 Phase 2 extractor，老物件可能為 null → 顯示 `—`（重訪物件頁面開 popup 可自動補齊，見 `_backfillSpecs()`）
- 租屋單價 = `totalPrice / size`（元/坪，計算值）；售屋單價 = `unitPrice`（萬/坪，已算好）
- 租屋的屋齡/樓層永遠為 `—`：591 rent `__NUXT__` 在 price+area 層級不含這兩個欄位，屬已知限制
- `buildingAge` 存為字串（如 `"19年"`）；比較頁用 `parseFloat()` 取數字後顯示，避免重複出現「年」
- **公設比無法實作**：DOM `權狀坪數` CSS 混淆（值為空），dataLayer 亦無坪數細項，目前無任何途徑取得主建物/附屬/公設分項坪數

---

## Phase 規劃

### Phase 1（已完成）— MVP
- 591 租屋/售屋座標提取（含 IIFE / rsMapIframe 等難點修復）
- Nominatim reverse geocoding 取得正確繁中地址（含門牌）
- 正向 POI（捷運/全聯/便利商店/國小/國中/醫院/公園/銀行/麥當勞/星巴克）+ 嫌惡設施
- 收藏 + 看房狀態 + 看房筆記 + 評分
- 比較頁（規格 strip + 物件卡）
- 凶宅（Google 搜尋，帶 reverse geocode 地址）/ 實價登錄（link-out）

### Phase 2（已完成）— 物件規格 + 設定
- ✅ 自訂 POI 設定頁（settings.html/js/css）
- ✅ 自訂地點改版：popup 搜尋頁新增獨立 `section-custom`；空白時顯示虛線 CTA → 開 settings.html；有項目時正常渲染（不再藏在 poi-grid 末端）
- ✅ 租屋規格：`_extractFromNuxtObject()` 同時收集 coords + specs（price/area/layout/kindTxt/address）
- ✅ 租屋規格補充：`fetchRentSpecs()`（MAIN world），ISOLATED world 只抓到座標時補抓
- ⚠️ 租屋 __NUXT__ 不含屋齡/樓層：實測確認 591 rent 的 Nuxt 資料在 price+area 同層不含這兩個欄位，無法從 JS 取得，比較頁顯示 `—` 是正常行為
- ✅ 售屋規格：`_extractSpecsSale()` 從 DOM 抓格局字串；`fetchSaleSpecs()` 從 `window.dataLayer` 抓總價/坪數/單價/屋齡/樓層/建物類型/方位/裝潢
- ✅ `renderSpecs()` 顯示規格列（租屋：坪/格局/類型/月租；售屋：坪/格局/類型/屋齡/樓層/方位/裝潢/總價/單價）
- ✅ 收藏 schema 補齊 `unitPrice`, `floor`, `buildingAge`, `direction`, `fitment`
- ✅ 比較頁改版：規格對比 strip + 物件卡補充（筆記摘要/標籤）

### Phase 3b（已完成）— 降價追蹤
- ✅ `priceHistory: [{ price, date }]` 加入 favorites schema（max 10 筆）
- ✅ `_checkPriceChange(specs)` 每次 popup 開啟後比對，有變動自動寫入
- ✅ 一鍵更新價格：`refreshAllPrices()` + `fetchPriceFromUrl(url, source)` 於 popup-favorites.js
  - 直接 `fetch()` SSR HTML（extension bypass CORS），DOMParser 掃 inline script
  - sale591：找 `"price_name": 數字`；rent591：找 `"price": 數字`
  - 進度顯示 `0/N → 1/N`，完成後重繪
- ✅ 搜尋頁 spec chip 顯示漲跌（↓綠 / ↑橙）
- ✅ 看房清單卡片 UI 改版：名稱 + 價格 chip 同行（flex），移除 meta 地址列
- ✅ 🔄 追蹤房價按鈕：看房清單篩選列右上角（align-self: flex-end，含文字）

### Phase 2c（已完成）— 比較頁規格補強 + 雜項修正
- ✅ 售屋存入 race condition 修復：`_specsReady` promise 追蹤 `fetchSaleSpecs` / `fetchRentSpecs`，`handleSaveToggle` await 後才存入，確保 dataLayer 資料不遺漏
- ✅ 老物件自動回寫：`_backfillSpecs()` 在規格取得後，若物件已在收藏則 patch 補齊空白欄位（重訪即生效）
- ✅ 比較頁屋齡顯示修正：`buildingAge` 存為 `"19年"` 字串，`parseFloat()` 取數字顯示，修復「15年 年」重複問題，同時修正 warn >= 35 邏輯
- ✅ 方位（`direction_name`）+ 裝潢（`fitment_name`）從 dataLayer 提取，加入搜尋頁規格列與比較頁 strip
- ✅ emoji 重複修正：`locales.js` 的 `fav_export`、`fav_import`、`share_copy` 移除前綴 emoji（HTML 已有，避免雙重顯示）

### Phase 2b（已完成）— 環境風險
- ✅ 搜尋頁新增「🌍 環境風險」可收折區塊（預設收折，首次展開才查詢）
- ✅ 三項資料同時查詢，各自獨立更新 UI
- ✅ 各項目加 ⓘ tooltip（說明情境/等級定義），section 底部加資料來源

#### 土壤液化潛勢
- API：`POST https://www.liquid.net.tw/cgs/Generic/GHMap.ashx`
  - Body：`method=GetDegree&x={lng}&y={lat}`
- 回傳 `Content.Degree`：`1`=高潛勢、`2`=低潛勢、`3`=中潛勢、`4`=無資料
- **CORS 問題**：liquid.net.tw 無 `Access-Control-Allow-Origin` header，popup 無法直接 fetch
  - 解法：`background.js` 新增 `fetchLiquefaction` message handler，popup 用 `chrome.runtime.sendMessage` 呼叫
  - manifest.json 新增 `host_permissions: ["https://www.liquid.net.tw/*"]`

#### 淹水潛勢
- API：`GET https://maps.wra.gov.tw/arcgis/rest/services/WMS/GIC_WMS/MapServer/116/query`
  - 使用 Layer 116（24小時 650mm 最嚴峻情境）
  - 參數：`geometry={lng},{lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=flood_dept,Class&returnGeometry=false&f=json`
- 回傳 `features[0].attributes.Class`（1–5 對應淹水深度）；`features` 為空 = 無淹水潛勢
- CORS：動態反映 Origin，直接 fetch 可用 ✅

#### 活動斷層距離
- API：`GET https://www.geologycloud.tw/api/v1/ActiveFault?all=true`
- 回傳 GeoJSON FeatureCollection（134 條活動斷層，LineString / MultiLineString）
- **距離計算**（不依賴外部 lib）：
  1. 對每條斷層的每個線段（segment）執行 `pointToSegmentDist()`
  2. `pointToSegmentDist()` = 向量投影求最近點，再用 Haversine 算球面距離（公尺）
  3. 取所有 segment 中最小值 → 最近斷層名稱 + 距離
- **快取**：GeoJSON 存入 `hs_fault_cache`（`chrome.storage.local`），TTL 30 天，避免重複下載 ~800KB
- CORS：`Access-Control-Allow-Origin: *`，直接 fetch 可用 ✅

#### 風險等級色碼
| 顏色 | 情境 |
|------|------|
| 🔴 紅（`--danger`） | 液化高潛勢 / 淹水 ≥1m / 斷層 <1km |
| 🟡 橙（`--warn`） | 液化中潛勢 / 淹水 <1m / 斷層 1–3km |
| 🟢 綠（`--green`） | 液化低潛勢 / 無淹水潛勢 / 斷層 ≥3km |
| ⚪ 灰（`--text-3`） | 無資料 / 無法查詢 |

### Phase 3（部分完成）— 進階功能

---

#### ✅ Phase 3b — 降價追蹤（已完成，見上方）

---

#### ✅ Phase 3d — 實價登錄溢價分析（已完成）

**實際採用方案**：591 自家 `bff-market.591.com.tw` API（非政府 ZIP）
- `hid_communityId` hidden input → communityId（ISOLATED world 可讀）
- `[community-name]` attribute → communityName
- API：`GET https://bff-market.591.com.tw/v1/price/list?community_id={id}&split_park=1&page=1&page_size=20`
  - Header：`Referer: https://market.591.com.tw/`
  - CORS：需經 background.js 代理
  - manifest.json `host_permissions` 加 `https://bff-market.591.com.tw/*`
- 資料來源：政府實價登錄（所有成交，非僅 591 物件）
- **限制**：透天厝、偏鄉物件 communityId=0 → 不顯示（此類物件成交量稀少，均價意義也低）
- UI：搜尋頁「📋 社區成交行情」可收折，展開才 fetch；顯示歷史成交 N 筆、社區均價、本物件 ▲/▼ X%

---

#### ✅ Phase 3a — 貸款試算（已完成）

合併進「💰 價格分析」區塊（原「📋 社區成交行情」），僅售屋且有 `totalPrice` 時顯示。

**公式**：本利平均攤還（PMT）
```
P = totalPrice × 10000 × 貸款成數
r = 年利率 / 12
n = 年期 × 12
月付 = P × r(1+r)^n / [(1+r)^n − 1]
```
**UI**：
- 成數 chips：六成 / 七成（預設）/ 八成
- 年期 chips：20年 / 30年（預設）
- 利率 chips：2% / 2.5%（預設）/ 3%
- 即點即算，顯示貸款額（萬）+ 月付（萬，accent 大字）
- 狀態（`_loanRatio/Years/Rate`）跨渲染保留，同一 session 內切物件不跳回預設

---

#### ✅ Phase 3c — 通勤距離（已完成）

**storage key**：`hs_commute_places: [{ label, lat, lng }]`（max 5 筆，`lib/storage.js`）

**Settings 頁**（`settings.html/js`）：「🚗 常去地點」區塊，輸入名稱 + 地址 → Nominatim geocode（`/search?q=...&countrycodes=tw`）→ 存座標，最多 5 筆，可刪除

**搜尋頁**（`popup.js` `renderCommuteChips()`）：specs 下方顯示直線距離 pill chips，點擊開 Google Maps 導航
```
[公司 2.3km]  [娘家 285km]
```
- Haversine 距離計算（複用 `haversineDist()`）
- 無常去地點時 container 隱藏，不佔空間

**比較頁**（`popup-compare.js`）：spec strip 末端加通勤距離列（每個常去地點一列），最短距離標綠，前有細分隔線；複製比較結果也包含通勤距離

**搜尋頁規格列整理**（同 session 完成）：
- 主列（永遠顯示）：總價/月租、單價、坪數、格局、建物類型、屋齡
- 次要（`⋯` 展開）：樓層、方位、裝潢
- `display: contents` 讓展開 chips 無縫融入 flex 行

---

#### （已放棄）Phase 3d 原始方案 — 政府 ZIP 下載

**CSV 座標問題**
CSV 無 WGS84 座標，只有地址（路段門牌）。近鄰查詢策略：
→ **路段比對法**：從 `currentData.address`（Nominatim 提供）解析出 路段名稱，篩選同路段成交記錄，計算平均單價/坪

**資料 Pipeline**
```
1. 從 currentData.address 解析縣市代碼 + 行政區 + 路段
2. 查 IndexedDB 有無該縣市快取（TTL 90天）
3. 無快取 → background.js 下載 ZIP
4. ZIP 解壓（Web Streams DecompressionStream 或 JSZip）
5. 解析 CSV → 過濾建物買賣 + 住宅用途
6. 寫入 IndexedDB（key: 縣市代碼，value: 解析後陣列）
7. 查詢：同行政區 + 同路段 → 取近 2 年資料
8. 計算：平均單價/坪、成交筆數、價格區間
9. 與 currentData.specs.unitPrice 比對 → 溢價 %
```

**IndexedDB Schema**
```js
// DB: hs_lvr_db
// Store: transactions  → { city, district, road, unitPrice, area, date, type }
// Store: meta          → { city, season, cachedAt }
// Index on [city, district, road]
```

**技術難點**
- ZIP 解壓：Chrome MV3 支援 `DecompressionStream`（gzip），但 ZIP 格式需要 JSZip（需 bundle）或 fflate（輕量）
- CSV 可能有數萬行 → background.js 處理避免 popup 超時
- 下載大小：單一縣市約 5–20MB，需進度提示

**UI 呈現**（搜尋頁可收折區塊）
```
📋 附近成交行情
同路段近2年 23 筆  平均 87 萬/坪
本物件 86.37 萬/坪  ▼ 低估 0.7%（合理範圍）
```

**暫不實作**
- 匯出 CSV
- 房仲媒合

---

## 發布前清單（Chrome Web Store）

### ✅ 已完成
- manifest.json 版本號 → `1.1.0`
- `privacy.html`：繁中隱私政策，說明 Nominatim / 水利署 / 地質雲 / bff-market 等外部請求
- `about.html`：品牌說明頁（footer 點擊開啟），含隱私政策連結
- footer position 修正（flex column 貼底）

### 🔲 待完成（發布前必須）
- **圖示替換**：icon16/32/48/128.png — 正式 logo 製作中，完成後覆蓋 `imag/` 內四個檔案
- **回報問題 URL**：`about.html` 與 `privacy.html` 中的 `github.com/risa-studio/homescope/issues` 為佔位符，需建立真實 repo 或替換為 Google Form
- **隱私政策公開 URL**：Chrome Web Store 需填一個公開可連結的隱私政策 URL（非 extension 內部頁）；建議托管於 GitHub Pages 或 Portly 個人頁

### 🔲 待完成（發布前建議）
- **商店截圖**：需 1280×800 或 640×400 PNG，建議各頁籤至少一張（搜尋頁 / 看房清單 / 比較頁 / 環境風險 / 說明頁）
- **商店說明文字**：短描述（≤132 字元）+ 長描述（591 租售兩用、功能亮點、資料來源）
- **Portly 斗內**：申請完成後，以 `<img>` 替換 `about.html` 內 Portly QR 佔位框，並加入 `<a>` 連結

### ❌ 不需要
- 英語支援（台灣本地產品，POI 關鍵字無法英文化）
- 多語系 i18n

---

## UI 架構補充

### Footer 修正（2026-04）
- `body` 加 `display: flex; flex-direction: column`
- `#app` 加 `flex: 1; display: flex; flex-direction: column`
- `.tab-pane.active` 加 `flex: 1; overflow-y: auto`
- 效果：footer 永遠貼底，active pane 填滿剩餘空間

### about.html（品牌說明頁，2026-04）
- `footer#footer` 點擊 → `chrome.tabs.create({ url: getURL('about.html') })`
- 包含：功能亮點 grid / 使用說明 / 更新日誌 / 關於開發者
- 樣式：`about.css`（HomeScope 青綠主題，仿 StayScope donate.css 架構）

### ❌ 英語支援（決定不實作）
591 是台灣本地平台，POI 關鍵字皆為台灣在地中文詞彙（全聯、宮廟…），英文搜尋會得到錯誤結果。目標用戶幾乎全為台灣人，維護成本高、收益極低，維持 zh-TW 單語系。

---

## 與 StayScope 的關係

- 獨立插件，不依賴 StayScope
- `extractors/base.js` 直接從 StayScope 複製，需手動同步 bug 修復
- storage key 前綴不同（`hs_` vs `ss_`），可同時安裝
- 架構模式（extractor/content/popup 三層）與 StayScope 完全相同

---

## 驗證用 URL

- 租屋詳情：`https://rent.591.com.tw/20884816`（東門捷運套房）
- 售屋詳情：`https://sale.591.com.tw/home/house/detail/2/19699550.html`
- 租屋列表（應顯示「請前往詳情頁」）：`https://rent.591.com.tw/`

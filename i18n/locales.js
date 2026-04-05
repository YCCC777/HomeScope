// ============================================================
// HomeScope — i18n / 台灣在地關鍵字
// 只有 zh-TW，不做多語系
// ============================================================
'use strict';

const UI_STRINGS = {
  // 頁籤
  tab_search:    '🔍 搜尋',
  tab_favorites: '🏠 看房清單',
  tab_compare:   '⚖️ 比較',

  // 狀態
  status_detecting:   '偵測物件座標中...',
  status_not_listing: '請前往 591 租屋或售屋的物件詳情頁使用',
  status_failed:      '無法提取座標，請重新整理頁面後再試',

  // 平台來源
  source_rent591: '591租屋',
  source_sale591: '591售屋',

  // 搜尋頁
  label_poi:      '生活機能',
  label_hazards:  '⚠️ 嫌惡設施',

  // 正向 POI 按鈕
  btn_transit:      '🚇 捷運站',
  btn_supermarket:  '🛒 全聯',
  btn_convenience:  '🏪 便利商店',
  btn_school:       '🏫 國小',
  btn_junior:       '🏫 國中',
  btn_hospital:     '🏥 醫院',
  btn_park:         '🌳 公園',
  btn_bank:         '🏦 銀行',
  btn_mcdonalds:    '🍟 麥當勞',
  btn_starbucks:    '☕ 星巴克',

  // 嫌惡設施按鈕
  btn_temple:       '🏮 宮廟',
  btn_funeral:      '⚰️ 殯儀館',
  btn_columbarium:  '🪦 納骨塔',
  btn_ktv:          '🍺 小吃部KTV',
  btn_gas_station:  '⛽ 加油站',
  btn_power_tower:  '⚡ 高壓電塔',
  btn_garbage:      '🗑️ 垃圾場',

  // 搜尋半徑
  radius_label: '搜尋半徑',

  // 物件資訊
  pin_badge:      '在地圖查看房源',
  map_center_hint: '搜尋地圖已以房源為中心',
  unknown_address: '地址未知',

  // 凶宅 / 實價登錄
  btn_haunted:  '🔍 凶宅查詢',
  btn_lvr:      '📊 實價登錄',
  btn_school:   '🏫 學區查詢',

  // 收藏
  btn_save:   '⭐ 收藏',
  btn_saved:  '✅ 已收藏',

  // 收藏頁篩選
  fav_filter_all:       '全部',
  fav_filter_unvisited: '未看',
  fav_filter_scheduled: '預約中',
  fav_filter_visited:   '已看',
  fav_filter_rent:      '租屋',
  fav_filter_sale:      '售屋',

  // 收藏頁空狀態
  fav_empty:      '尚無看房紀錄',
  fav_empty_hint: '在搜尋頁點擊 ⭐ 收藏目前物件',

  // 收藏操作
  fav_open_url:         '591 物件頁面',
  fav_delete:           '移除',
  fav_compare_select:   '加入比較',
  fav_name_placeholder: '自訂名稱...',
  fav_tags_placeholder: '標籤（逗號分隔）',
  fav_refresh_prices:   '更新價格',
  fav_export:           '匯出 JSON',
  fav_import:           '匯入 JSON',

  // 看房狀態
  viewing_unvisited: '● 未看',
  viewing_scheduled: '● 預約中',
  viewing_visited:   '● 已看',
  viewing_note_placeholder: '看房筆記（採光、氣味、鄰居印象...）',
  viewing_rating_label: '主觀評分',

  // checklist 標籤
  checklist_transit:      '捷運',
  checklist_supermarket:  '全聯',
  checklist_convenience:  '便利店',
  checklist_school:       '國小',
  checklist_junior:       '國中',
  checklist_hospital:     '醫院',
  checklist_park:         '公園',
  checklist_bank:         '銀行',
  checklist_mcdonalds:    '麥當勞',
  checklist_starbucks:    '星巴克',

  // 嫌惡設施標籤
  hazard_temple:       '宮廟',
  hazard_funeral:      '殯儀館',
  hazard_columbarium:  '納骨塔',
  hazard_ktv:          '小吃部',
  hazard_gas_station:  '加油站',
  hazard_power_tower:  '高壓電塔',
  hazard_garbage:      '垃圾場',

  // 快選標籤
  tag_first_choice:  '🏆 首選',
  tag_backup:        '🔄 備選',
  tag_negotiate:     '💬 需議價',
  tag_too_expensive: '💸 太貴',
  tag_bad_transit:   '🚇 交通差',
  tag_old_building:  '🏚️ 老舊',
  tag_nice_view:     '🌅 採光好',
  tag_quiet:         '🔇 安靜',

  // 比較頁
  compare_empty:         '請在看房清單選取 2–5 筆物件',
  compare_summary_title: '比較清單',
  share_copy:            '複製比較結果',
  share_copied:          '✅ 已複製！',
  share_copy_fail:       '複製失敗，請手動複製',

  // 批次操作
  batch_selected: '已選 {n} 筆',
  batch_delete:   '刪除已選',

  // 歷史
  history_title: '🕒 最近瀏覽',
  history_clear: '🗑️ 清除歷史',
  history_empty: '尚無瀏覽記錄',

  // 時間
  time_just_now: '剛剛',
  time_min_ago:  '{n} 分鐘前',
  time_hr_ago:   '{n} 小時前',
  time_day_ago:  '{n} 天前',

  // Footer
  footer_about: '關於 HomeScope',
  footer_links: '使用說明 · 意見回饋',
};

// ---- Google Maps 搜尋關鍵字（台灣）----
const TW_POI_KEYWORDS = {
  // 正向 POI
  transit:      '捷運站',
  supermarket:  '全聯',
  convenience:  '便利商店',
  school:       '國小',
  junior:       '國中',
  hospital:     '醫院',
  park:         '公園',
  bank:         '銀行',
  mcdonalds:    '麥當勞',
  starbucks:    '星巴克',
  // 嫌惡設施
  temple:       '宮廟',
  funeral:      '殯儀館',
  columbarium:  '納骨塔',
  ktv:          '小吃部KTV',
  gasStation:   '加油站',
  powerTower:   '高壓電塔',
  garbage:      '資源回收場&垃圾場',
};

// ---- 取得 UI 字串（HomeScope 只有 zh-TW）----
function getUiStrings() {
  return UI_STRINGS;
}

// ---- 取得搜尋關鍵字 ----
function getSearchKeywords() {
  return TW_POI_KEYWORDS;
}

// ---- 國家資訊（HomeScope 只用到 TW）----
const COUNTRY_INFO = {
  TW: { name: '台灣', flag: '🇹🇼' },
};

function getCountryInfo(code) {
  return COUNTRY_INFO[code] || null;
}

// ============================================================
// HomeScope — Background Service Worker
// 負責管理工具列圖示的徽章狀態
// ============================================================

'use strict';

// ============================================================
// 土壤液化潛勢查詢（liquid.net.tw 無 CORS，需從 background 呼叫）
// ============================================================
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'fetchMarketPrices') {
    const url = `https://bff-market.591.com.tw/v1/price/list?community_id=${message.communityId}&split_park=1&page=1&page_size=20&_source=0`;
    fetch(url, {
      headers: { 'Referer': 'https://market.591.com.tw/' }
    })
      .then(r => r.json())
      .then(resp => {
        if (resp.status !== 1) { sendResponse({ success: false }); return; }
        sendResponse({ success: true, data: resp.data });
      })
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'fetchLiquefaction') {
    fetch('https://www.liquid.net.tw/cgs/Generic/GHMap.ashx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `method=GetDegree&x=${message.lng}&y=${message.lat}`
    })
      .then(r => r.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // 保持 message channel 開啟等待非同步回應
  }
});

// 收到 content.js 或 popup.js 傳來的座標更新通知
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.action !== 'coordinatesUpdated') return;

  const tabId = sender.tab?.id || message.tabId;
  if (!tabId) return;

  if (message.data?.success) {
    chrome.action.setBadgeText({ text: '✓', tabId }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ color: '#34C759', tabId }).catch(() => {});
  } else {
    chrome.action.setBadgeText({ text: '!', tabId }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ color: '#FF9F0A', tabId }).catch(() => {});
  }
});

// 離開 591 物件詳情頁時清除徽章
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return;
  const url = changeInfo.url;
  const isListingPage =
    /rent\.591\.com\.tw\/\d+/.test(url) ||
    /sale\.591\.com\.tw\/home\/house\/detail\//.test(url);

  if (!isListingPage) {
    chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
  }
});

// ============================================================
// HomeScope — Content Script 入口
// 呼叫平台提取器 → 快取結果 → 訊息監聽 → SPA 偵測
// ============================================================

(function () {
  'use strict';

  let cachedData = null;

  function extractCoordinates() {
    if (cachedData) return cachedData;

    const result = typeof window.__siteExtractFn === 'function'
      ? window.__siteExtractFn()
      : null;

    if (result) {
      if (!result.country && result.lat != null) {
        result.country = detectCountryFromCoords(result.lat, result.lng);
      }
      cachedData = { ...result, success: true, url: location.href };
    } else {
      cachedData = { success: false, url: location.href };
    }

    return cachedData;
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getCoordinates') {
      const data = extractCoordinates();
      sendResponse(data);
    }
    return true;
  });

  // SPA 偵測（rent.591.com.tw 是 Nuxt SPA，切頁不完整重載）
  let lastUrl = location.href;

  const navObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      cachedData = null;

      const isListing =
        /rent\.591\.com\.tw\/\d+/.test(location.href) ||
        /sale\.591\.com\.tw\/home\/house\/detail\//.test(location.href);

      if (isListing) {
        // Nuxt hydration 需要較長時間，用 2000ms
        setTimeout(() => {
          const data = extractCoordinates();
          chrome.runtime.sendMessage({ action: 'coordinatesUpdated', data }).catch(() => {});
        }, 2000);
      }
    }
  });

  navObserver.observe(document.documentElement, { subtree: true, childList: true });

  // 初次載入（Nuxt 頁面 hydration 需要更長時間）
  setTimeout(() => {
    const data = extractCoordinates();
    chrome.runtime.sendMessage({ action: 'coordinatesUpdated', data }).catch(() => {});
  }, 2000);

})();

// ============================================================
// HomeScope — Compare Panel
// 依賴 popup.js 的全域狀態：ui, favList
// 依賴 popup-favorites.js：CHECKLIST_KEYS, CHECKLIST_ICONS, HAZARD_KEYS
// ============================================================
'use strict';

// ============================================================
// Main render
// ============================================================
function renderCompare() {
  const grid = document.getElementById('compare-grid');
  if (!grid) return;

  const checkedIds = [];
  document.querySelectorAll('.fav-compare-cb:checked').forEach(cb => checkedIds.push(cb.dataset.id));

  const selected = checkedIds
    .map(id => favList.find(f => f.id === id))
    .filter(Boolean)
    .slice(0, 5);

  if (selected.length < 2) {
    grid.innerHTML = '';
    show('compare-empty');
    const actionBar = document.getElementById('compare-action-bar');
    if (actionBar) actionBar.classList.add('hidden');
    return;
  }
  hide('compare-empty');

  const hasMix = selected.some(f => f.listingType === 'rent') && selected.some(f => f.listingType === 'sale');
  const mixNotice = hasMix
    ? '<div class="cmp-mix-notice">⚠ 同時比較租屋與售屋，價格欄位單位不同</div>'
    : '';

  const strip = buildCompareStrip(selected);
  grid.innerHTML = mixNotice + strip + selected.map((f, i) => buildCompareCardHTML(f, i)).join('');

  const actionBar = document.getElementById('compare-action-bar');
  if (actionBar) actionBar.classList.remove('hidden');
  const shareBtn = document.getElementById('btn-share-copy');
  if (shareBtn) shareBtn.onclick = () => copyCompareSummary(selected);

  grid.querySelectorAll('[data-cmp-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = favList.find(x => x.id === btn.dataset.id);
      if (!f) return;
      if (btn.dataset.cmpAction === 'pin') openUrl(`https://www.google.com/maps?q=${f.lat},${f.lng}`);
      else if (btn.dataset.cmpAction === 'link') openUrl(f.url);
    });
  });
}

// ============================================================
// 規格對比 Strip
// ============================================================
function buildCompareStrip(selected) {
  const allRent   = selected.every(f => f.listingType === 'rent');
  const allSale   = selected.every(f => f.listingType === 'sale');
  const mixedType = !allRent && !allSale;

  // 各維度資料
  const priceVals = selected.map(f => {
    if (!f.totalPrice) return null;
    return f.listingType === 'rent'
      ? { display: f.totalPrice.toLocaleString() + ' 元', raw: f.totalPrice }
      : { display: f.totalPrice + ' 萬', raw: f.totalPrice };
  });

  const mgmtVals = selected.map(f => {
    if (!f.managementFee || f.listingType !== 'rent') return null;
    return { display: f.managementFee.toLocaleString() + ' 元', raw: f.managementFee };
  });

  const unitVals = selected.map(f => {
    if (f.unitPrice) return { display: f.unitPrice + ' 萬/坪', raw: f.unitPrice };
    if (f.totalPrice && f.size && f.listingType === 'rent') {
      const u = Math.round(f.totalPrice / f.size);
      return { display: u.toLocaleString() + ' 元/坪', raw: u };
    }
    return null;
  });

  const sizeVals = selected.map(f =>
    f.size ? { display: f.size + ' 坪', raw: f.size } : null
  );

  const ageVals = selected.map(f => {
    if (f.buildingAge == null) return null;
    const ageNum = parseFloat(f.buildingAge); // buildingAge 存為 "19年" 字串，取數字部分
    const display = isNaN(ageNum) ? String(f.buildingAge) : `${ageNum} 年`;
    return { display, raw: ageNum, warn: ageNum >= 35 };
  });

  const floorVals = selected.map(f => {
    if (!f.floor) return null;
    const d = f.totalFloor ? `${f.floor}F / ${f.totalFloor}F` : `${f.floor}F`;
    return { display: d, raw: f.floor };
  });

  const layoutVals = selected.map(f =>
    f.layout ? { display: f.layout, raw: null } : null
  );

  const directionVals = selected.map(f =>
    f.direction ? { display: f.direction, raw: null } : null
  );

  const fitmentVals = selected.map(f =>
    f.fitment ? { display: f.fitment, raw: null } : null
  );

  const priceLabel = allRent ? '月租' : allSale ? '總價' : '月租/總價';

  const rowDefs = [
    { label: priceLabel, vals: priceVals,    bestDir: mixedType ? null : 'min' },
    { label: '管理費',   vals: mgmtVals,     bestDir: null },
    { label: '單價',     vals: unitVals,     bestDir: mixedType ? null : 'min' },
    { label: '坪數',     vals: sizeVals,     bestDir: 'max' },
    { label: '屋齡',     vals: ageVals,      bestDir: null },
    { label: '樓層',     vals: floorVals,    bestDir: null },
    { label: '格局',     vals: layoutVals,   bestDir: null },
    { label: '方位',     vals: directionVals, bestDir: null },
    { label: '裝潢',     vals: fitmentVals,  bestDir: null },
  ];

  // 通勤距離（依賴 popup.js 的 commutePlaces 全域 + haversineDist）
  const commuteRows = [];
  if (typeof commutePlaces !== 'undefined' && commutePlaces.length) {
    commutePlaces.forEach(place => {
      const distVals = selected.map(f => {
        if (!f.lat || !f.lng) return null;
        const dist = haversineDist(f.lat, f.lng, place.lat, place.lng);
        const display = dist >= 1000
          ? `${(dist / 1000).toFixed(1)}km`
          : `${Math.round(dist)}m`;
        return { display, raw: dist };
      });
      commuteRows.push({ label: `🚗 ${place.label}`, vals: distVals, bestDir: 'min' });
    });
  }

  const activeRows = rowDefs.filter(r => r.vals.some(v => v !== null));
  if (!activeRows.length) return '';

  let html = '<div class="cmp-strip">';

  // Header row
  html += '<div class="cmp-strip-row cmp-strip-header">';
  html += '<div class="cmp-strip-label"></div>';
  selected.forEach((f, i) => {
    const label = String.fromCharCode(65 + i);
    html += `<div class="cmp-strip-cell cmp-header-cell" title="${escHtml(f.name || '')}">${label}</div>`;
  });
  html += '</div>';

  // Data rows
  activeRows.forEach(({ label, vals, bestDir }) => {
    const bestIdx = bestDir ? findBestIdx(vals, bestDir) : -1;
    html += '<div class="cmp-strip-row">';
    html += `<div class="cmp-strip-label">${label}</div>`;
    vals.forEach((v, i) => {
      if (!v) {
        html += '<div class="cmp-strip-cell cmp-empty">—</div>';
      } else {
        const cls = (bestIdx === i) ? 'cmp-best' : v.warn ? 'cmp-warn' : '';
        const warn = v.warn ? ' <span class="cmp-age-warn">⚠</span>' : '';
        html += `<div class="cmp-strip-cell ${cls}">${escHtml(v.display)}${warn}</div>`;
      }
    });
    html += '</div>';
  });

  // 通勤距離列（有設定常去地點才顯示，前加分隔線）
  if (commuteRows.length) {
    html += `<div class="cmp-strip-sep" style="grid-column:1/-1"></div>`;
    commuteRows.forEach(({ label, vals, bestDir }) => {
      const bestIdx = findBestIdx(vals, bestDir);
      html += '<div class="cmp-strip-row">';
      html += `<div class="cmp-strip-label">${label}</div>`;
      vals.forEach((v, i) => {
        if (!v) {
          html += '<div class="cmp-strip-cell cmp-empty">—</div>';
        } else {
          const cls = (bestIdx === i) ? 'cmp-best' : '';
          html += `<div class="cmp-strip-cell ${cls}">${escHtml(v.display)}</div>`;
        }
      });
      html += '</div>';
    });
  }

  html += '</div>';
  return html;
}

function findBestIdx(vals, dir) {
  const withData = vals.filter(v => v && v.raw != null);
  if (withData.length < 2) return -1;
  let best = dir === 'min' ? Infinity : -Infinity;
  let idx  = -1;
  vals.forEach((v, i) => {
    if (!v || v.raw == null) return;
    if (dir === 'min' ? v.raw < best : v.raw > best) { best = v.raw; idx = i; }
  });
  return idx;
}

// ============================================================
// 物件卡
// ============================================================
function buildCompareCardHTML(f, idx) {
  const label    = String.fromCharCode(65 + idx);
  const name     = escHtml(f.name || f.url);
  const srcLabel = f.source ? (ui[`source_${f.source}`] || f.source) : '';
  const status   = f.viewingStatus || 'unvisited';
  const statusLabel = status === 'visited' ? '●已看' : status === 'scheduled' ? '●預約' : '●未看';

  const rating = f.viewingRating;
  const ratingHtml = rating
    ? `<span class="compare-card-score">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</span>`
    : '';

  // 正向 POI 已確認
  const cl = f.checklist || {};
  const confirmedPoi = CHECKLIST_KEYS.filter(key => cl[key] === true);
  const poiCells = confirmedPoi.map(key =>
    `<span class="cmp-ck-cell">${CHECKLIST_ICONS[key]} <span class="cmp-ck-cell-label">${escHtml(ui[`checklist_${key}`] || key)}</span></span>`
  ).join('');

  // 嫌惡設施已確認有
  const hz = f.hazards || {};
  const confirmedHazards = HAZARD_KEYS.filter(key => hz[key] === true);
  const hazardCells = confirmedHazards.map(key => {
    const hzKey = key === 'gasStation' ? 'gas_station' : key === 'powerTower' ? 'power_tower' : key;
    return `<span class="cmp-ck-cell cmp-ck-cell-warn">⚠️ <span class="cmp-ck-cell-label">${escHtml(ui[`hazard_${hzKey}`] || key)}</span></span>`;
  }).join('');

  const checksSection = (confirmedPoi.length || confirmedHazards.length)
    ? `<div class="compare-card-checks">${poiCells}${hazardCells}</div>`
    : '';

  // 筆記摘要
  const note = f.viewingNote?.trim();
  const noteHtml = note
    ? `<div class="cmp-card-note">「${escHtml(note.slice(0, 55))}${note.length > 55 ? '…' : ''}」</div>`
    : '';

  // 標籤
  const tagsHtml = f.tags?.length
    ? `<div class="cmp-card-tags">${f.tags.map(t => `<span class="cmp-tag-chip">${escHtml(t)}</span>`).join('')}</div>`
    : '';

  return `
  <div class="compare-card">
    <div class="compare-card-header">
      <span class="compare-card-label">${label}</span>
      <div class="compare-card-info">
        <div class="compare-card-name" title="${name}">${name}</div>
        <div class="compare-card-source">${srcLabel} · <span class="viewing-badge ${status}">${statusLabel}</span></div>
      </div>
      ${ratingHtml}
      <button class="compare-card-pin" data-cmp-action="pin" data-id="${f.id}" title="Google Maps">📍</button>
      ${f.url ? `<button class="compare-card-pin" data-cmp-action="link" data-id="${f.id}" title="591 頁面">🔗</button>` : ''}
    </div>
    ${noteHtml}
    ${tagsHtml}
    ${checksSection}
  </div>`;
}

// ============================================================
// 複製比較結果
// ============================================================
function copyCompareSummary(selected) {
  const date  = new Date().toLocaleDateString('zh-TW');
  const lines = [];
  lines.push(`🏠 HomeScope 比較清單 (${date})`);
  lines.push('');

  selected.forEach((f, i) => {
    const name     = f.name || f.url;
    const srcLabel = f.source ? (ui[`source_${f.source}`] || f.source) : '';
    const label    = String.fromCharCode(65 + i);
    const status   = f.viewingStatus === 'visited' ? '已看' : f.viewingStatus === 'scheduled' ? '預約中' : '未看';

    lines.push(`${label}｜${name}${srcLabel ? ` [${srcLabel}]` : ''} (${status})`);
    if (f.address) lines.push(`  📍 ${f.address}`);
    lines.push(`  🗺 https://www.google.com/maps?q=${f.lat},${f.lng}`);

    // 規格
    const specParts = [];
    if (f.totalPrice) {
      specParts.push(f.listingType === 'rent'
        ? `月租 ${f.totalPrice.toLocaleString()}元`
        : `總價 ${f.totalPrice}萬`);
    }
    if (f.managementFee && f.listingType === 'rent') specParts.push(`管理費 ${f.managementFee.toLocaleString()}元`);
    if (f.size)         specParts.push(`${f.size}坪`);
    if (f.unitPrice)    specParts.push(`${f.unitPrice}萬/坪`);
    if (f.layout)       specParts.push(f.layout);
    if (f.buildingAge != null) specParts.push(`屋齡${f.buildingAge}年`);
    if (f.floor)        specParts.push(f.totalFloor ? `${f.floor}F/${f.totalFloor}F` : `${f.floor}F`);
    if (specParts.length) lines.push(`  📐 ${specParts.join('  ')}`);

    const cl = f.checklist || {};
    const ckParts = CHECKLIST_KEYS
      .filter(key => cl[key] !== undefined)
      .map(key => (cl[key] ? '✅' : '❌') + (ui[`checklist_${key}`] || key));
    if (ckParts.length) lines.push(`  ${ckParts.join('  ')}`);

    const hz = f.hazards || {};
    const hzParts = HAZARD_KEYS
      .filter(key => hz[key] === true)
      .map(key => {
        const hzKey = key === 'gasStation' ? 'gas_station' : key === 'powerTower' ? 'power_tower' : key;
        return '⚠️ ' + (ui[`hazard_${hzKey}`] || key);
      });
    if (hzParts.length) lines.push(`  嫌惡：${hzParts.join('  ')}`);

    if (typeof commutePlaces !== 'undefined' && commutePlaces.length && f.lat && f.lng) {
      const distParts = commutePlaces.map(p => {
        const dist = haversineDist(f.lat, f.lng, p.lat, p.lng);
        const label = dist >= 1000 ? `${(dist / 1000).toFixed(1)}km` : `${Math.round(dist)}m`;
        return `${p.label} ${label}`;
      });
      lines.push(`  🚗 ${distParts.join('  ')}`);
    }
    if (f.viewingRating) lines.push(`  評分：${'★'.repeat(f.viewingRating)}${'☆'.repeat(5 - f.viewingRating)}`);
    if (f.viewingNote?.trim()) lines.push(`  筆記：${f.viewingNote.trim()}`);
    if (f.tags?.length) lines.push(`  標籤：${f.tags.join(', ')}`);
    lines.push('');
  });

  navigator.clipboard.writeText(lines.join('\n')).then(() => {
    const btn = document.getElementById('btn-share-copy');
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = ui.share_copied || '✅ 已複製！';
    setTimeout(() => { btn.textContent = orig; }, 1800);
  }).catch(() => {
    alert(ui.share_copy_fail || '複製失敗，請手動複製');
  });
}

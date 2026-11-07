// 游戏主界面：顶栏 / 导航 / 各功能面板 / 回合循环
import {
  tick, marketShare, suggestedPrice, unitCost, capacityOf, FOUNDRIES, factoryCapacity,
  startResearch, researchBudget, avgShare, bomUnit, assemblyUnit, ownFactoryCount,
  suggestTargets, techOffers, buyTech, poachFromRival,
} from '../core/sim.js';
import {
  saveGame, loadGame, saveSlots, deleteSave, staffPower, deptCost, generateEmployee,
  ensureLayout, autoSave, queueAutoSave, flushAutoSave,
  DEPT_DEFS, ROLE_BY_DEPT, traitNames, addLog, officeCapacity,
} from '../core/state.js';
import { historyRows, historyTotals, historyMaxUnits, compHistoryRows } from '../core/history.js';
import { newModel, derive, validate, bomCost } from '../core/design.js';
import { phoneBackDataUrl, phoneFrontDataUrl } from './designer.js';
import { openFloorplanPlanner } from './floorplan2d.js';
import { openScreenDesign } from './screendesign.js';
import { openPosterStudio } from './poster.js';
import { TECHS, TECH_MAP, TECH_CATS, techState } from '../data/tech.js';
import { MARKETS, MARKET_MAP, COUNTRIES, eraFactor, expectedPrice, SEGMENTS, SEGMENT_MAP, LINEUPS, LINEUP_MAP, marketMix, suggestModelName, signatureOf } from '../data/world.js';
import { DIVISION_DEFS, DIVISION_IDS, buildDivision, startUpgrade, upgradeCost, computeCustomSpec, ownCpuSpec, ownCmrSpec, ownOsSpec, ownPanelSpec, releaseOsVersion, toggleOsLicense, osReleaseCost, startOsTech, osTechBonuses, chooseOsRoute } from '../core/divisions.js';
import { OS_TECHS, OS_TECH_BRANCHES, osTechState, OS_ROUTES } from '../data/os-tech.js';
import { CPU_CORES, GPU_ARCHS, OS_BASES, RES_TIERS, LENS_TYPES } from '../data/hardware.js';
import { MILESTONES, milestoneProgress } from '../core/milestones.js';
import {
  BUILDINGS, BUILDING_MAP, buildingCost, startBuild, canBuild, upgradeBuilding, canUpgrade,
  buyPlot, constructionProgress, campusBonus, plotUtilization,
} from '../core/campus.js';
import {
  COMPONENTS, COMPONENT_MAP, ensureSupply, leadTime, placeOrder, stockCoverage,
  turnoverDays, inTransit, supplyHealth, SPOT_PREMIUM, supplierBoard, disruptionList,
} from '../core/supply.js';
import { activePolicies } from '../core/policy.js';
import { overseasOf, overseasInvest, overseasUpkeepSingle, effectiveTariff, buildOverseas, sellOverseas } from '../core/overseas.js';
import {
  RANKS, TRAININGS, TRAINING_MAP, rankOf, startTraining, cancelTraining, trainingSummary,
  rankDistribution, trainingCost,
} from '../core/staff.js';
import { CPUS, RAMS, STORAGES, SCREENS, CAMERAS, BATTERIES, SYSTEMS, EXTRAS } from '../data/parts.js';
import {
  ensureOrg, focusOf, headOf, execOf, appointHead, clearHead, appointExec, clearExec,
  candidatesFor, execCandidates, orgTree, stageOf, COMPANY_STAGES, EXEC_SEATS, FOCUS_HINT,
  leaderBonus, headBonus,
} from '../core/org.js';
import {
  ensureCapital, valuationOf, raiseRound, raiseLimit, founderPct, ipoRequirements, canIPO,
  listIPO, marketCap, acquisitionCost, acquire, annualRevenue, annualProfit,
  openNegotiation, negotiateOffer, walkAway, foundSubsidiary, sellSubsidiary, SUB_POSITIONS,
  acceptSubTech, declineSubTech, acceptSubEmployee, declineSubEmployee,
  PAY_MODES, dealPrice, setPayMode, charmTarget, compDefense, subRelease,
} from '../core/capital.js';
import { computeReview, defectRate } from '../core/reviews.js';
import { channelTotal, channelSummary, setChannel, SALES_CHANNELS, ensureSalesChannels, channelInvest, channelSalesMul } from '../core/marketing.js';
import { WARRANTY_POLICIES, warrantyOf, setWarrantyPolicy } from '../core/aftermarket.js';
import { advanceGuide, skipGuide, restartGuide, GUIDE_STEPS, advanceHints, markHint } from '../core/guide.js';
import { industryRating } from '../core/rating.js';
import { fmtMoney, fmtNum, fmtUnit, fmtDate, clamp, esc, sum } from '../core/util.js';
import { sfx, audioEnabled, setAudioEnabled, setAudioVolume, audioVolume, unlockAudio } from '../core/audio.js';
import { renderDesigner } from './designer.js';
import { createOfficeScene, readQualityPref, writeQualityPref } from '../three/office.js';
import { exportSave, importSave } from '../core/state.js';
import { createStageScene } from '../three/stage.js';

const BUILD_EFFECT_LABEL = {
  capacity: '月产能', rndSpeed: '研发速度', designScore: '设计评分',
  channelCut: '渠道成本', warrantyCut: '售后成本', quality: '质量基准', brand: '品牌',
};
const BUILD_EFFECT_FMT = {
  capacity: (v) => `+${fmtUnit(v)}/级`,
  rndSpeed: (v) => `+${Math.round(v * 100)}%/级`,
  designScore: (v) => `+${v}/级`,
  channelCut: (v) => `-${(v * 100).toFixed(1)} 个百分点/级`,
  warrantyCut: (v) => `-${Math.round(v * 100)}%/级`,
  quality: (v) => `+${v}/级`,
  brand: (v) => `+${v}/级`,
};

// 政策效果 → 可读文案
const POLICY_EFFECT_LABEL = {
  demandMul: '市场需求', costMul: '物料成本', rndMul: '研发速度',
  salaryMul: '人力成本', tariffAdd: '海外关税', taxAdd: '所得税率',
  morale: '员工满意度', brandCut: '品牌增长',
};
function POLICY_EFFECT_TEXT(effects) {
  return Object.entries(effects).map(([k, v]) => {
    const label = POLICY_EFFECT_LABEL[k] || k;
    if (k === 'taxAdd' || k === 'tariffAdd') return `${label} ${v > 0 ? '+' : ''}${(v * 100).toFixed(0)} 个百分点`;
    if (k === 'morale') return `${label} +${v}`;
    const pct = Math.round((v - 1) * 100);
    return `${label} ${pct > 0 ? '+' : ''}${pct}%`;
  }).join(' · ');
}

const PAGES = [
  { id: 'overview', name: '公司总览', icon: '▦' },
  { id: 'product', name: '设计与产品', icon: '▭' },
  { id: 'tech', name: '研发中心', icon: '⌬' },
  { id: 'selfrnd', name: '自研部门', icon: '⚗' },
  { id: 'supply', name: '生产供应链', icon: '⚒' },
  { id: 'market', name: '市场与销售', icon: '◎' },
  { id: 'company', name: '组织与员工', icon: '☺' },
  { id: 'finance', name: '财务中心', icon: '¥' },
  { id: 'rivals', name: '竞争对手', icon: '⚔' },
  { id: 'hq', name: '公司园区', icon: '⌂' },
  { id: 'news', name: '通知与新闻', icon: '🔔' },
];

export function renderGame(root, state, opts = {}) {
  let tab = 'overview';
  let prevTab = null; // 上一次渲染的页面：同页刷新保持滚动位置，切页才回顶部
  let speed = 0;
  let timer = null;
  let designer = null;
  let scene = null;
  let lastReport = null;
  let pendingDesignId = null;
  let activeModal = null;
  let rivalChart = 'bar';
  let empFilter = 'all';
  let prodFilter = 'all';
  let sbCollapsed = localStorage.getItem('mm_sb_collapsed') === '1';
  const foldedSeries = new Set();
  let rivalRank = 'month';
  let renameTargetId = null;

  const app = {
    destroy() { stop(); modalObserver.disconnect(); if (designer) designer.destroy(); if (scene) scene.destroy(); },
    handleKey(e) {
      if (e.code === 'Space') { e.preventDefault(); setSpeed(speed === 0 ? 1 : 0); }
      if (['1', '2', '3', '4'].includes(e.key)) setSpeed([1, 2, 4, 8][Number(e.key) - 1]);
      if (e.key === 'Escape' && designer) { designer.destroy(); designer = null; render(); }
    },
    tickOnce, app: null,
  };

  function setSpeed(v) {
    speed = v;
    if (timer) clearInterval(timer);
    timer = null;
    if (v > 0) {
      const ms = { 1: 2200, 2: 1100, 4: 550, 8: 260 }[v] || 2200;
      timer = setInterval(() => tickOnce(true), ms);
    }
    paintTopbar();
  }

  function stop() { if (timer) clearInterval(timer); timer = null; }

  // 任意 .modal-mask 弹窗 / 全屏编辑页（data-pause-game）打开时暂停时间，关闭后恢复原速度
  let modalPausedSpeed = 0;
  let modalPaused = false;
  const modalObserver = new MutationObserver(() => {
    const open = !!(document.querySelector('.modal-mask') || document.querySelector('[data-pause-game]'));
    if (open && !modalPaused) {
      modalPaused = true;
      modalPausedSpeed = speed;
      if (speed) setSpeed(0);
    } else if (!open && modalPaused) {
      modalPaused = false;
      const resume = modalPausedSpeed;
      modalPausedSpeed = 0;
      if (resume) setSpeed(resume);
    }
  });
  modalObserver.observe(document.body, { childList: true, subtree: true });

  function tickOnce(silent) {
    if (designer) return;
    const r = tick(state);
    lastReport = r;
    if (r.bankrupt) {
      setSpeed(0);
      sfx('bad');
      setTimeout(() => gameOver(r), 300);
      return;
    }
    queueAutoSave(state); // 月度推进合并写盘（2 秒防抖），避免 8× 速度下反复全量序列化
    // 月度推进的底鼓：静默推进（自动连播）时不响，避免刷屏
    if (!silent) sfx('month');
    // 重要事件提示
    for (const n of (r.notes || []).slice(0, 3)) {
      if (n.includes('达成里程碑')) sfx('milestone');
      else if (n.includes('研发完成')) sfx('research');
      else if (n.includes('竣工') || n.includes('落成')) sfx('built');
      if (n.includes('研发完成') || n.includes('离职') || n.includes('发布新机')) opts.onToast?.(n, n.includes('完成') ? 'good' : '');
    }
    if ((r.spotUnits || 0) > 0 && !state.flags.supplyWarned) {
      state.flags.supplyWarned = true;
      opts.onToast?.('元器件不足，缺口走现货采购，成本上浮 16%。去「生产供应链」提前下单。', 'warn');
    }
    if ((r.spotUnits || 0) === 0 && state.flags.supplyWarned) state.flags.supplyWarned = false;
    if (r.notes && r.notes.some((n) => n.includes('库存不足'))) {
      // 只在首次提示
      if (!state.flags.shortageWarned) {
        state.flags.shortageWarned = true;
        opts.onToast?.('有市场出现缺货，去「生产供应链」提高产量。', 'warn');
      }
    }
    render();
  }

  function gameOver(r) {
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `
      <div class="modal">
        <h2 class="bad">公司破产</h2>
        <div class="modal-sub">${fmtDate(state.date)}，${esc(state.company.name)} 因现金流断裂停止运营。</div>
        <div class="report-grid">
          <div class="line"><span>存活时间</span><b>${state.date.year - state.company.founded} 年</b></div>
          <div class="line"><span>最高月销量</span><b>${fmtUnit(Math.round(historyMaxUnits(state)))}</b></div>
          <div class="line"><span>累计营收</span><b>${fmtMoney(historyTotals(state).revenue)}</b></div>
          <div class="line"><span>最终品牌</span><b>${state.company.brand.toFixed(0)}</b></div>
        </div>
        <div class="row" style="margin-top:18px;justify-content:flex-end;gap:8px">
          <button class="btn" id="go-menu">返回主菜单</button>
          <button class="btn primary" id="go-load">读取存档</button>
        </div>
      </div>`;
    document.body.appendChild(mask);
    mask.querySelector('#go-menu').onclick = () => { mask.remove(); opts.onExit?.(); };
    mask.querySelector('#go-load').onclick = () => {
      mask.remove();
      const s = loadGame(1);
      if (s) opts.onExit?.();
      else opts.onToast?.('槽位 1 没有存档', 'bad');
    };
  }

  // ---------- 框架 ----------
  root.innerHTML = `
    <div class="game">
      <div class="topbar" id="topbar"></div>
      <div class="layout">
        <div class="sidebar" id="sidebar"></div>
        <div class="content" id="content"></div>
      </div>
      <div class="rotate-hint"><div class="icon">📱</div><div>建议横屏使用以获得完整体验</div><button class="btn primary" data-act="rotate-dismiss">仍要竖屏使用</button></div>
    </div>`;
  const topbar = root.querySelector('#topbar');
  const sidebar = root.querySelector('#sidebar');
  const content = root.querySelector('#content');

  sidebar.innerHTML = '<div class="nav-item sb-toggle" data-act="sb-toggle" title="折叠 / 展开侧边栏"><span class="ico">«</span><span class="txt">收起</span></div><div class="nav-sep"></div>' +
    PAGES.map((p) => `
    <div class="nav-item" data-tab="${p.id}" title="${p.name}">
      <span class="ico">${p.icon}</span><span class="txt">${p.name}</span>
    </div>`).join('');
  const syncSbToggle = () => {
    const t = sidebar.querySelector('[data-act="sb-toggle"]');
    if (!t) return;
    t.querySelector('.ico').textContent = sbCollapsed ? '»' : '«';
    t.querySelector('.txt').textContent = sbCollapsed ? '' : '收起';
  };
  if (sbCollapsed) { sidebar.classList.add('collapsed'); root.querySelector('.layout').classList.add('sb-collapsed'); }
  syncSbToggle();

  // 竖屏提示关闭
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="rotate-dismiss"]')) {
      const el = root.querySelector('.rotate-hint');
      if (el) el.style.display = 'none';
    }
  });

  sidebar.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="sb-toggle"]')) {
      sbCollapsed = !sbCollapsed;
      localStorage.setItem('mm_sb_collapsed', sbCollapsed ? '1' : '0');
      sidebar.classList.toggle('collapsed', sbCollapsed);
      root.querySelector('.layout')?.classList.toggle('sb-collapsed', sbCollapsed);
      syncSbToggle();
      return;
    }
    const nav = e.target.closest('[data-tab]');
    if (nav) { tab = nav.dataset.tab; designer?.destroy(); designer = null; render(); }
    if (e.target.closest('[data-act="exit"]')) openExitConfirm();
  });

  // 返回主菜单：询问是否保存进度（自动存档槽，不覆盖 1~3 手动槽位）
  function openExitConfirm() {
    document.querySelector('.modal-mask')?.remove();
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `<div class="modal">
      <h2>返回主菜单</h2>
      <div class="modal-sub">退出前是否保存当前进度？</div>
      <div class="tiny dim" style="margin-bottom:14px">${esc(state.company.name)} · ${fmtDate(state.date)} · 现金 ${fmtMoney(state.company.cash)}</div>
      <div class="row" style="justify-content:flex-end;gap:8px;flex-wrap:wrap">
        <button class="btn" data-act="exit-cancel">取消</button>
        <button class="btn danger" data-act="exit-nosave">不保存退出</button>
        <button class="btn primary" data-act="exit-save">保存并退出</button>
      </div>
    </div>`;
    document.body.appendChild(mask);
    mask.addEventListener('click', (ev) => {
      const act = ev.target.closest('[data-act]')?.dataset.act;
      if (act === 'exit-cancel') { mask.remove(); }
      else if (act === 'exit-save') {
        stop();
        try { autoSave(state); opts.onToast?.('已保存', 'good'); } catch (err) { /* 静默 */ }
        mask.remove(); opts.onExit?.();
      } else if (act === 'exit-nosave') {
        stop(); mask.remove(); opts.onExit?.();
      } else if (ev.target === mask) { mask.remove(); }
    });
  }

  function paintTopbar() {
    const unreadNews = (state.news || []).filter((n) => !n.read).length;
    const c = state.company;
    const rep = lastReport;
    const share = avgShare(state);
    const logoMark = c.logoData
      ? (c.logoData.startsWith('<svg')
        ? `<span style="display:inline-flex;vertical-align:middle">${c.logoData.replaceAll('width="20" height="20"', 'width="18" height="18"')}</span>`
        : `<img src="${c.logoData}" width="18" height="18" style="border-radius:4px;vertical-align:middle;object-fit:contain" alt=""/>`)
      : `<i style="background:${c.logoColor}"></i>`;
    topbar.innerHTML = `
      <div class="brand">${logoMark}${esc(c.name)}${c.nameEn ? `<span class="tiny dim" style="margin-left:6px;font-weight:400">${esc(c.nameEn)}</span>` : ''}</div>
      <div class="stat-inline"><span class="k">日期</span><span class="v">${fmtDate(state.date)}</span></div>
      <div class="stat-inline"><span class="k">现金</span><span class="v ${c.cash < 0 ? 'bad' : ''}">${fmtMoney(c.cash)}</span></div>
      <div class="stat-inline"><span class="k">份额</span><span class="v">${(share * 100).toFixed(2)}%</span></div>
      <div class="stat-inline"><span class="k">品牌</span><span class="v">${c.brand.toFixed(0)}</span></div>
      ${rep ? `<div class="stat-inline"><span class="k">上月净利</span><span class="v ${rep.net >= 0 ? 'good' : 'bad'}">${fmtMoney(rep.net)}</span></div>` : ''}
      <div class="spacer"></div>
      <div class="speed-group">
        <button data-act="speed" data-v="0" class="${speed === 0 ? 'on' : ''}">❚❚</button>
        <button data-act="speed" data-v="1" class="${speed === 1 ? 'on' : ''}">1×</button>
        <button data-act="speed" data-v="2" class="${speed === 2 ? 'on' : ''}">2×</button>
        <button data-act="speed" data-v="4" class="${speed === 4 ? 'on' : ''}">4×</button>
        <button data-act="speed" data-v="8" class="${speed === 8 ? 'on' : ''}">8×</button>
      </div>
      <button class="btn small" data-act="advance">下个月 ▸</button>
      <button class="btn small ghost" data-act="open-news" title="通知与新闻">🔔${unreadNews ? ` <b style="color:#f56b6b">${unreadNews}</b>` : ''}</button>
      <button class="btn small ghost" data-act="open-gamemenu" title="菜单">☰</button>`;
  }

  topbar.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'speed') { setSpeed(Number(el.dataset.v)); return; }
    if (el.dataset.act === 'advance') { if (speed > 0) setSpeed(0); tickOnce(false); return; }
    if (el.dataset.act === 'save') {
      saveGame(state, Number(el.dataset.slot));
      opts.onToast?.('已保存到槽位 ' + el.dataset.slot, 'good');
    }
    if (el.dataset.act === 'open-news') { tab = 'news'; designer?.destroy(); designer = null; render(); return; }
    if (el.dataset.act === 'open-gamemenu') { gameMenu(); return; }
    if (el.dataset.act === 'toggle-audio') {
      unlockAudio();
      const on = setAudioEnabled(!audioEnabled());
      paintTopbar();
      if (on) sfx('good');
    }
  });

  content.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    act(err(el.dataset.act), deps(el));
  });
  content.addEventListener('change', (e) => {
    const el = e.target.closest('[data-field]');
    if (!el) return;
    field(el.dataset.field, el, deps(el));
  });
  content.addEventListener('input', (e) => {
    const el = e.target.closest('[data-live]');
    if (!el) return;
    const out = content.querySelector(`[data-out="${el.dataset.live}"]`);
    if (out) out.textContent = el.value;
  });

  function err(name) { return name; }
  function deps(el) { return el.dataset; }

  // 事件路由
  function act(name, ds) {
    const id = ds.id;
    switch (name) {
      case 'goto': tab = ds.tab; render(); break;
      case 'advance': setSpeed(0); tickOnce(false); break;
      case 'create-model': {
        const name = suggestModelName(state, state.models.map((x) => x.name));
        const m = newModel(state.date.year, state.tech.unlocked, name);
        m.markets = [];
        m.price = {};
        m.lineup = ds.lineup || 'main';
        state.models.push(m);
        closeModal();
        openDesigner(m.id);
        break;
      }
      case 'rename-model': {
        const cur = state.models.find((x) => x.id === ds.id);
        if (!cur) break;
        const s = suggestModelName(state, state.models.map((x) => x.name).filter((n) => n !== cur.name));
        renameTargetId = ds.id;
        const curSeries = cur.series || String(cur.name).trim().split(/\s+/)[0] || '';
        const rest = cur.series ? String(cur.name).trim().slice(cur.series.length).trim() : String(cur.name).trim().split(/\s+/).slice(1).join(' ');
        modalShell('机型命名', `当前名称：${cur.name} · 系列是自由命名的产品家族（如 Apex），可归属任意产品线`, `
          <div class="field">
            <span>系列名（自由命名，如 Apex / Nova）</span>
            <input type="text" id="rename-series" value="${esc(curSeries)}" maxlength="14" style="margin-bottom:8px" />
          </div>
          <div class="field">
            <span>型号名（代数/后缀，如 2 / one / 3 Pro）</span>
            <input type="text" id="rename-input" value="${esc(rest)}" maxlength="18" style="margin-bottom:8px" />
            <div class="tiny dim">完整名称 = 系列 + 型号 · 规范建议：<b>${esc(s)}</b> <button class="btn small" data-act="use-suggest-name" data-s="${esc(s)}">采用建议</button></div>
          </div>
          <div class="row" style="margin-top:14px;justify-content:flex-end">
            <button class="btn" data-act="close-modal">取消</button>
            <button class="btn primary" data-act="confirm-rename">确认命名</button>
          </div>`);
        break;
      }
      case 'use-suggest-name': {
        const inp = document.querySelector('#rename-input');
        const ser = document.querySelector('#rename-series');
        const parts = String(ds.s || '').trim().split(/\s+/);
        if (inp) inp.value = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '';
        if (ser) ser.value = parts.length > 1 ? parts[0] : '';
        break;
      }
      case 'confirm-rename': {
        const inp = document.querySelector('#rename-input');
        const ser = document.querySelector('#rename-series');
        const m = state.models.find((x) => x.id === renameTargetId);
        if (m) {
          const series = (ser?.value || '').trim();
          const rest = (inp?.value || '').trim();
          const full = [series, rest].filter(Boolean).join(' ');
          if (full) {
            m.name = full;
            m.series = series || null;
            addLog(state, 'product', `机型更名为「${m.name}」${series ? `（系列：${series}）` : ''}。`);
          }
        }
        closeModal();
        render();
        break;
      }
      case 'open-lineup': openLineupPicker(ds.lineupTarget || null); break;
      case 'set-lineup': {
        const m = state.models.find((x) => x.id === id);
        if (!m) break;
        m.lineup = ds.lineup || 'main';
        m.price = {};
        closeModal();
        addLog(state, 'product', `${m.name} 归入${(LINEUP_MAP[m.lineup] || {}).name || '数字系列'}。`);
        render(); break;
      }
      case 'design': openDesigner(id); break;
      case 'delete-model':
        state.models = state.models.filter((m) => m.id !== id);
        render(); break;
      case 'launch': {
        const m = state.models.find((x) => x.id === id);
        const sandboxAll = state.mode === 'sandbox' && state.tech.all;
        const v = validate(m.design, state.date.year,
          sandboxAll ? { ignoreEra: true, unlocked: state.tech.unlocked } : { unlocked: state.tech.unlocked });
        if (!v.ok) { opts.onToast?.('设计未通过合理性检查，无法量产', 'bad'); break; }
        const planned = Number(m.productionTarget) > 0 ? Number(m.productionTarget) : 20000;
        const launchCost = 500000 + planned * 2;
        if (state.company.cash < launchCost) { opts.onToast?.('上市推广资金不足', 'bad'); break; }
        state.company.cash -= launchCost;
        m.status = 'production';
        m.launched = { ...state.date };
        m.released = false; // 量产≠发布：需要单独举办新品发布会（一机仅一次）
        m.heat = 55; // 量产基础热度；发布会命中可冲到 80~100+
        m.price.cn = m.price.cn || suggestedPrice(state, m, 'cn');
        if (!m.markets.length) m.markets = ['cn'];
        m.productionTarget = m.productionTarget || 20000;
        m.quality = state.production.quality;
        // 上市即算一次预计口碑：玩家不用等一个月才知道这款机器会被怎么评价
        const preview = computeReview(state, m);
        m.review = preview;
        m.rating = Math.round(preview.user * 0.6 + preview.media * 0.4);
        addLog(state, 'product', `${m.name} 量产完成，待举办发布会后开始销售。`);
        sfx('launch');
        opts.onToast?.(`${m.name} 已量产，下一步：发布产品（推广费用 ${fmtMoney(launchCost)}）`, 'good');
        render(); break;
      }
      case 'discontinue': {
        const m = state.models.find((x) => x.id === id);
        m.status = 'discontinued';
        m.productionTarget = 0;
        addLog(state, 'product', `${m.name} 停止销售。`);
        render(); break;
      }
      case 'research': {
        if (state.tech.researching) { opts.onToast?.('已有研发项目在进行', 'warn'); break; }
        const t = TECH_MAP[id];
        const r = startResearch(state, id);
        if (!r.ok) { opts.onToast?.(r.msg, 'bad'); break; }
        opts.onToast?.(`已立项：${t.name}，每月预算 ${fmtMoney(researchBudget(state))}`, 'good');
        render(); break;
      }
      case 'cancel-research':
        state.tech.researching = null;
        addLog(state, 'tech', '研发项目取消，前期投入不会退还。');
        render(); break;
      case 'hire': {
        const c = state.hiringPool?.[Number(ds.i)];
        if (!c) break;
        const isHH = state.recruitChannel === 'headhunter';
        const fee = c.salary * 2 * (isHH ? 1.2 : 1);
        if (state.company.cash < fee) { opts.onToast?.(isHH ? '资金不足（含猎头费 20%）' : '资金不足，无法支付招聘费用', 'bad'); break; }
        state.company.cash -= fee;
        state.employees.push({ ...c, deptId: ds.dept || c.deptId, role: c.role });
        state.hiringPool.splice(Number(ds.i), 1);
        addLog(state, 'hr', `招聘 ${c.name}（${c.role}），月薪 ${fmtMoney(c.salary)}。`);
        opts.onToast?.(`${c.name} 已入职`, 'good');
        render(); break;
      }
      case 'fire': {
        const e = state.employees.find((x) => x.id === id);
        if (!e) break;
        state.employees = state.employees.filter((x) => x.id !== id);
        state.company.cash -= e.salary * 2;
        addLog(state, 'hr', `解雇 ${e.name}，支付补偿 ${fmtMoney(e.salary * 2)}。`);
        render(); break;
      }
      case 'raise': {
        const e = state.employees.find((x) => x.id === id);
        if (!e) break;
        e.salary = Math.round(e.salary * 1.1 / 100) * 100;
        e.expectSalary = Math.max(e.expectSalary, e.salary);
        e.satisfaction = clamp(e.satisfaction + 8, 0, 100);
        render(); break;
      }
      case 'recruit-channel': state.recruitChannel = ds.v; state.hiringPool = genPool(state, ds.v); render(); break;
      case 'campus-event': {
        if (state.company.cash < 3000000) { opts.onToast?.('资金不足', 'bad'); break; }
        state.company.cash -= 3000000;
        state.recruitment = state.recruitment || {};
        state.recruitment.campusEventMonths = 3;
        state.hiringPool = genPool(state, 'campus');
        addLog(state, 'hr', '举办校园招聘会，应届生候选人批量涌入。');
        opts.onToast?.('校园招聘会已举办', 'good');
        render();
        break;
      }
      case 'refresh-pool': state.hiringPool = genPool(state, state.recruitChannel || 'social'); render(); break;
      case 'expand-office': {
        const o = state.offices[0];
        const cost = 2000000 * o.level;
        if (state.company.cash < cost) { opts.onToast?.('资金不足', 'bad'); break; }
        state.company.cash -= cost;
        o.level += 1;
        o.capacity += 40;
        render(); break;
      }
      case 'open-stage': openStage(ds.model || ds.id); break;
      case 'order-comp': {
        const el = content.querySelector(`[data-order="${ds.cat}"]`);
        const qty = Number(el ? el.value : 0);
        const selSup = content.querySelector(`[data-supplier="${ds.cat}"]`);
        const r = placeOrder(state, ds.cat, qty, staffPower(state, 'supply'), selSup ? selSup.value : null);
        if (!r.ok) { opts.onToast?.(r.msg, 'bad'); break; }
        addLog(state, 'supply', `向${r.supplier}下单 ${COMPONENT_MAP[ds.cat].name} ${fmtNum(r.qty)} 件，${r.lead} 个月后到货。`);
        opts.onToast?.(`${COMPONENT_MAP[ds.cat].name} 已向${r.supplier}下单，${r.lead} 个月后到货${r.disrupted ? '（断供顺延）' : ''}`, r.disrupted ? 'warn' : 'good');
        render(); break;
      }
      case 'buy-plot': {
        const r = buyPlot(state, ds.plot);
        if (!r.ok) { opts.onToast?.(r.msg, 'bad'); break; }
        opts.onToast?.('购地成功，可以开始建造', 'good');
        render(); break;
      }
      case 'open-build': openBuildModal(ds.plot); break;
      case 'build': {
        const r = startBuild(state, ds.plot, ds.type);
        if (!r.ok) { opts.onToast?.(r.msg, 'bad'); break; }
        document.querySelector('.modal-mask')?.remove();
        sfx('build');
        opts.onToast?.(`${BUILDING_MAP[ds.type].name} 已动工`, 'good');
        render(); break;
      }
      case 'upgrade-building': {
        const r = upgradeBuilding(state, ds.plot);
        if (!r.ok) { opts.onToast?.(r.msg, 'bad'); break; }
        sfx('build');
        opts.onToast?.('升级工程已启动', 'good');
        render(); break;
      }
      case 'open-train': openTrainingModal(ds.id); break;
      case 'open-layout':
        tab = 'hq';
        render();
        // 3D 内直接编辑：场景已挂载即进入编辑模式
        if (scene) {
          scene.setEditMode(true);
          opts.onToast?.('布局编辑已开启：左键操作，R 旋转，再次点击按钮退出', 'info');
        } else {
          opts.onToast?.('园区场景未就绪', 'warn');
        }
        break;
      case 'open-floorplan':
        tab = 'hq';
        render();
        openFloorplan();
        break;
      case 'open-screendesign':
        tab = 'hq';
        render();
        openScreenDesignUI();
        break;
      case 'open-poster': openPoster(ds.id); break;
      case 'clone-model': {
        const src = state.models.find((x) => x.id === ds.id);
        if (!src) break;
        const series = src.series || String(src.name).trim().split(/\s+/)[0] || '新系列';
        const inSeries = state.models.filter((x) => (x.series || String(x.name).trim().split(/\s+/)[0]) === series);
        const suffixes = ['Pro', 'Pro Max', 'Ultra', 'Plus', 'Lite', 'SE', 'Max', 'Mini'];
        const used = new Set(inSeries.map((x) => String(x.name).slice(series.length).trim()));
        const suffix = suffixes.find((sf) => !used.has(sf)) || `Gen${inSeries.length + 1}`;
        const nm = {
          ...JSON.parse(JSON.stringify(src)),
          id: 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          name: `${series} ${suffix}`,
          series,
          status: 'draft',
          launched: null,
          released: false,
          stageAt: null,
          price: {},
          inventory: 0,
          sold: 0,
          revenue: 0,
          rating: 0,
          hype: 0,
          heat: 0,
          reviews: [],
          history: [],
          comments: [],
          awards: [],
          markets: ['cn'],
        };
        nm.design.series = series;
        // 配置与销量历史不继承（新机型重新定价/重新售卖）
        if (nm.design.variants) nm.design.variants = nm.design.variants.map((v2) => ({ ...v2, sold: 0, revenue: 0, price: {} }));
        state.models.push(nm);
        addLog(state, 'product', `基于 ${src.name} 复制出同系列新机型 ${nm.name}（设计已继承，可继续调规格）`);
        opts.onToast?.(`已复制为「${nm.name}」，可直接改设计（尺寸/规格）`, 'good');
        render();
        break;
      }
      case 'open-news': openNewsPanel(); break;
      case 'rival-chart':
        rivalChart = ds.v;
        render();
        break;
      case 'rival-rank':
        rivalRank = ds.v;
        render();
        break;
      case 'comp-detail': openCompDetail(id); break;
      case 'open-emp': openEmpModal(id); break;
      case 'poach': {
        const r = poachFromRival(state, ds.comp);
        opts.onToast?.(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) sfx('good');
        closeModal();
        render();
        break;
      }
      case 'div-build': {
        const r = buildDivision(state, ds.id);
        opts.onToast?.(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) { sfx('build'); addLog(state, 'company', r.msg); }
        render();
        break;
      }
      case 'div-design': {
        const divId2 = ds.id;
        openRndModal(divId2, 'design');
        break;
      }
      case 'div-upgrade': {
        // 打开立项弹窗：命名 + 规格设计
        openRndModal(ds.id);
        break;
      }
      case 'os-release': openOsReleaseModal(); break;
      case 'os-release-confirm': {
        const inp = document.getElementById('os-ver-name');
        const r = releaseOsVersion(state, inp ? inp.value : '');
        if (r.ok) { activeModal?.close(); sfx('good'); addLog(state, 'tech', r.msg); }
        opts.onToast?.(r.msg, r.ok ? 'good' : 'bad');
        render();
        break;
      }
      case 'os-tech-start': {
        const r = startOsTech(state, ds.id);
        opts.onToast?.(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) sfx('build');
        render();
        break;
      }
      case 'emp-filter': empFilter = ds.v; render(); break;
      case 'prod-filter': prodFilter = ds.v; render(); break;
      case 'news-read-all': {
        (state.news || []).forEach((n) => { n.read = true; });
        paintTopbar();
        opts.onToast?.('已全部标为已读', 'good');
        render();
        break;
      }
      case 'series-fold': {
        if (foldedSeries.has(ds.v)) foldedSeries.delete(ds.v); else foldedSeries.add(ds.v);
        render();
        break;
      }
      case 'channel-invest': {
        const r = channelInvest(state, ds.id);
        opts.onToast?.(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) sfx('good');
        render();
        break;
      }
      case 'auto-production': {
        const sug = suggestTargets(state);
        let changed = 0;
        for (const t of sug.targets) {
          const m = state.models.find((x) => x.id === t.id);
          if (m && m.productionTarget !== t.to) { m.productionTarget = t.to; changed++; }
        }
        if (sug.qualityRisk && changed) {
          for (const m of state.models) if (m.status === 'production') m.quality = clamp((m.quality ?? 65) - 1.5, 5, 100);
          opts.onToast?.(`已按销量匹配 ${changed} 款机型排产（生产部人力不足，品质小幅波动）`, 'warn');
        } else {
          opts.onToast?.(`已按上月销量与热度匹配 ${changed} 款机型排产`, 'good');
        }
        if (changed) { addLog(state, 'product', `智能排产：${changed} 款机型按销量匹配调整。`); sfx('good'); }
        render();
        break;
      }
      case 'buy-tech': {
        const r = buyTech(state, ds.id);
        opts.onToast?.(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) sfx('good');
        render();
        break;
      }
      case 'os-route': {
        const r = chooseOsRoute(state, ds.id);
        opts.onToast?.(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) sfx('build');
        render();
        break;
      }
      case 'sub-tech-yes': { const r = acceptSubTech(state); opts.onToast?.(r.msg, r.ok ? 'good' : 'bad'); if (r.ok) sfx('good'); render(); break; }
      case 'sub-tech-no': { const r = declineSubTech(state); opts.onToast?.(r.msg, ''); render(); break; }
      case 'sub-emp-yes': { const r = acceptSubEmployee(state); opts.onToast?.(r.msg, r.ok ? 'good' : 'bad'); if (r.ok) sfx('good'); render(); break; }
      case 'sub-emp-no': { const r = declineSubEmployee(state); opts.onToast?.(r.msg, ''); render(); break; }
      case 'os-license': {
        const r = toggleOsLicense(state);
        opts.onToast?.(r.msg, r.ok ? 'good' : 'bad');
        render();
        break;
      }
      case 'ch-set': {
        const cur = state.marketing?.channels?.[ds.id] || 0;
        const nv = Math.max(0, cur + (ds.v === '+' ? 1 : -1) * 50000);
        const r = setChannel(state, ds.id, nv);
        if (r.ok) render(); else opts.onToast?.(r.msg, 'bad');
        break;
      }
      case 'warranty': {
        const r = setWarrantyPolicy(state, ds.id);
        opts.onToast?.(r.msg, r.ok ? 'good' : 'bad');
        render();
        break;
      }
      case 'guide-skip': {
        skipGuide(state);
        render();
        break;
      }
      case 'guide-restart': {
        restartGuide(state);
        opts.onToast?.('新手引导已重新开启', 'good');
        render();
        break;
      }
      case 'hint-dismiss': {
        markHint(state, ds.hint);
        render();
        break;
      }
      case 'guide-toggle': {
        if (state.guide?.skipped || (state.guide?.step || 0) >= GUIDE_STEPS.length) {
          restartGuide(state);
          opts.onToast?.('新手引导已开启', 'good');
        } else {
          skipGuide(state);
          opts.onToast?.('新手引导已关闭', 'good');
        }
        render();
        break;
      }
      case 'audio-toggle': {
        const on = setAudioEnabled(!audioEnabled());
        opts.onToast?.(on ? '音效已开启' : '音效已关闭', 'good');
        render();
        break;
      }
      case 'quality-set': {
        writeQualityPref(ds.q);
        opts.onToast?.(`画质已设为「${{ auto: '自动', high: '高', standard: '标准', low: '流畅' }[ds.q]}」，进入园区 3D 页面后生效`, 'good');
        render();
        break;
      }
      case 'export-save': {
        try {
          const blob = new Blob([exportSave(state)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `手机开发商_${state.company.name}_${state.date.year}年${state.date.month + 1}月.mm save.json`.replace(/\s+/g, '_');
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 3000);
          opts.onToast?.('存档已导出为文件', 'good');
        } catch (e) {
          opts.onToast?.('导出失败：' + e.message, 'bad');
        }
        break;
      }
      case 'import-save': {
        content.querySelector('#import-file')?.click();
        break;
      }
      case 'div-supply': {
        const div = state.divisions?.[ds.id];
        if (div && div.level > 0) {
          div.supplyOn = !div.supplyOn;
          opts.onToast?.(div.supplyOn ? `已开始对外供货：${DIVISION_DEFS[ds.id].name}` : '已停止对外供货', 'good');
          render();
        }
        break;
      }
      case 'build-overseas': {
        const r = buildOverseas(state, ds.m);
        opts.onToast?.(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) addLog(state, 'company', r.msg);
        render();
        break;
      }
      case 'sell-overseas': {
        const r = sellOverseas(state, ds.m);
        opts.onToast?.(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) addLog(state, 'company', r.msg);
        render();
        break;
      }
      case 'open-head': openHeadModal(ds.dept); break;
      case 'appoint-head': {
        const r = appointHead(state, ds.dept, ds.id);
        if (!r.ok) { opts.onToast?.(r.msg, 'bad'); break; }
        closeModal();
        opts.onToast?.(`${r.emp.name} 已出任主管`, 'good');
        render(); break;
      }
      case 'clear-head': {
        const r = clearHead(state, ds.dept);
        if (!r.ok) { opts.onToast?.(r.msg, 'warn'); break; }
        render(); break;
      }
      case 'open-exec': openExecModal(ds.seat); break;
      case 'appoint-exec': {
        const r = appointExec(state, ds.seat, ds.id);
        if (!r.ok) { opts.onToast?.(r.msg, 'bad'); break; }
        closeModal();
        opts.onToast?.(`${r.emp.name} 已出任 ${ds.seat.toUpperCase()}`, 'good');
        render(); break;
      }
      case 'clear-exec': {
        const r = clearExec(state, ds.seat);
        if (!r.ok) { opts.onToast?.(r.msg, 'warn'); break; }
        closeModal(); render(); break;
      }
      case 'train': {
        const r = startTraining(state, ds.id, ds.program);
        if (!r.ok) { opts.onToast?.(r.msg, 'bad'); break; }
        document.querySelector('.modal-mask')?.remove();
        opts.onToast?.(`培训已开始，每月 ${fmtMoney(r.monthly)}`, 'good');
        render(); break;
      }
      case 'cancel-train': {
        const r = cancelTraining(state, ds.id);
        if (!r.ok) { opts.onToast?.(r.msg, 'warn'); break; }
        opts.onToast?.('已停止培训，前期费用不退', 'warn');
        render(); break;
      }
      case 'loan': {
        const amount = Number(ds.amount);
        state.company.cash += amount;
        state.company.debt += amount;
        addLog(state, 'fin', `银行放款 ${fmtMoney(amount)}，年化利率 7.5%。`);
        render(); break;
      }
      case 'repay': {
        const amount = Math.min(Number(ds.amount), state.company.debt, state.company.cash);
        if (amount <= 0) { opts.onToast?.('没有可偿还的贷款', 'warn'); break; }
        state.company.cash -= amount;
        state.company.debt -= amount;
        render(); break;
      }
      case 'raise-capital': {
        const r = raiseRound(state, Number(ds.amount));
        if (!r.ok) { opts.onToast?.(r.msg, 'bad'); break; }
        opts.onToast?.(`${r.round.name} 投资 ${fmtMoney(r.round.amount)}，出让 ${r.round.pct}%`, 'good');
        render(); break;
      }
      case 'ipo': {
        const r = listIPO(state);
        if (!r.ok) { opts.onToast?.(r.msg, 'bad'); break; }
        opts.onToast?.(`上市成功，发行价 ¥${r.price.toFixed(2)}，募资 ${fmtMoney(r.raised)}`, 'good');
        render(); break;
      }
      case 'acquire': {
        // 发起收购谈判（弹窗多轮）；data-hostile=1 为敌意收购
        const r = openNegotiation(state, ds.comp, { hostile: ds.hostile === '1' });
        if (!r.ok) { opts.onToast?.(r.msg, 'bad'); break; }
        render();
        openNegotiationModal(r.n);
        break;
      }
      case 'sell-sub': {
        const r = sellSubsidiary(state, ds.id);
        opts.onToast?.(r.msg, r.ok ? 'good' : 'bad');
        render();
        break;
      }
      case 'sub-release': {
        const r = subRelease(state, ds.id);
        opts.onToast?.(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) sfx('launch');
        render();
        break;
      }
      case 'found-sub': {
        const name = content.querySelector('#sub-name')?.value || '';
        const en = content.querySelector('#sub-name-en')?.value || '';
        const pos = content.querySelector('#sub-pos')?.value || 'online';
        const r = foundSubsidiary(state, name, en, pos);
        opts.onToast?.(r.msg, r.ok ? 'good' : 'bad');
        render();
        break;
      }
      case 'save': saveGame(state, Number(ds.slot) || 1); opts.onToast?.('已保存', 'good'); render(); break;
      case 'load': {
        const s = loadGame(Number(ds.slot));
        if (!s) { opts.onToast?.('槽位为空', 'warn'); break; }
        stop();
        if (designer) { designer.destroy(); designer = null; }
        opts.onLoad?.(s);
        break;
      }
      case 'delete-save': deleteSave(Number(ds.slot)); render(); break;
      case 'toggle-market': {
        const m = state.models.find((x) => x.id === ds.model);
        if (!m) break;
        if (m.markets.includes(ds.market)) m.markets = m.markets.filter((x) => x !== ds.market);
        else {
          const cost = 800000;
          if (state.company.cash < cost) { opts.onToast?.('渠道铺设资金不足', 'bad'); break; }
          state.company.cash -= cost;
          m.markets.push(ds.market);
          if (!m.price[ds.market]) m.price[ds.market] = suggestedPrice(state, m, ds.market);
        }
        render(); break;
      }
      case 'auto-price': {
        const m = state.models.find((x) => x.id === ds.model);
        if (!m) break;
        m.price[ds.market] = suggestedPrice(state, m, ds.market);
        render(); break;
      }
      case 'v-auto-price': {
        const m = state.models.find((x) => x.id === ds.model);
        const vv = m && (m.design?.variants || [])[Number(ds.vi)];
        if (vv) {
          // 建议价 = 机型建议价 × 该版本相对基础配置的容量溢价（RAM+存储）
          const base = suggestedPrice(state, m, ds.market);
          const r0 = RAMS.find((x) => x.id === m.design.parts.ram), s0 = STORAGES.find((x) => x.id === m.design.parts.storage);
          const r1 = RAMS.find((x) => x.id === vv.ram), s1 = STORAGES.find((x) => x.id === vv.stg);
          const cap = (r, s2) => (r?.gb || 0.25) * 0.6 + (s2?.gb || 16) * 0.12;
          const mul = Math.max(0.75, Math.min(2.2, (cap(r1, s1) + 12) / (cap(r0, s0) + 12)));
          vv.price = vv.price || {};
          vv.price[ds.market] = Math.round(base * mul / 10) * 10;
        }
        render(); break;
      }
      case 'toggle-mode': {
        if (ds.mode === 'own' && !state.factories.length) {
          opts.onToast?.('还没有工厂，请先购地建厂', 'warn');
          break;
        }
        state.production.mode = ds.mode;
        render(); break;
      }
      case 'close-modal': document.querySelector('.modal-mask')?.remove(); break;
      case 'open-report': showReport(); break;
      default: break;
    }
  }

  function field(name, el) {
    const v = el.type === 'range' || el.type === 'number' ? Number(el.value) : el.value;
    if (name === 'dept-focus') {
      const d = state.departments.find((x) => x.id === el.dataset.id);
      if (d) d.focus = v;
      paintTopbar();
    }
    if (name === 'emp-dept') {
      const e = state.employees.find((x) => x.id === el.dataset.id);
      if (e) { e.deptId = v || null; e.role = v ? ROLE_BY_DEPT[v][Math.min(1, ROLE_BY_DEPT[v].length - 1)] : '待分配'; render(); }
    }
    if (name === 'marketing') { state.company.marketingBudget = v; paintTopbar(); }
    if (name === 'ch-budget') { setChannel(state, el.dataset.id, v); }
    if (name === 'quality') { state.production.quality = v; }
    if (name === 'foundry') { state.production.foundryId = v; render(); }
    if (name === 'prod-mode') { state.production.mode = v; render(); }
    if (name === 'target') {
      const m = state.models.find((x) => x.id === el.dataset.id);
      if (m) m.productionTarget = Math.max(0, Math.round(v));
    }
    if (name === 'price') {
      const m = state.models.find((x) => x.id === el.dataset.model);
      if (m) m.price[el.dataset.market] = Math.max(1, Math.round(v));
      render();
    }
    if (name === 'vprice') {
      const m = state.models.find((x) => x.id === el.dataset.model);
      const vv = m && (m.design?.variants || [])[Number(el.dataset.vi)];
      if (vv) {
        vv.price = vv.price || {};
        vv.price[el.dataset.market] = Math.max(1, Math.round(v));
      }
      render();
    }
    if (name === 'sandbox-cash') { state.company.cash = v; render(); }
    if (name === 'auto-supply') { ensureSupply(state).auto = el.checked; render(); }
  }

  // ---------- 渲染 ----------
  function render() {
    if (floorplanUI) { floorplanUI.destroy(); floorplanUI = null; }
    if (designer) designer.destroy();
    designer = null;
    if (scene) { scene.destroy(); scene = null; }
    paintTopbar();
    sidebar.querySelectorAll('[data-tab]').forEach((n) => n.classList.toggle('on', n.dataset.tab === tab));
    const page = PAGES.find((p) => p.id === tab) || PAGES[0];
    // 同页刷新（调价/切榜/开罢弹窗等）保持滚动位置；只有切换页面才回到顶部
    const tabChanged = prevTab !== tab;
    const keepScroll = content.scrollTop;
    content.innerHTML = pageShell(page, PAGES[tab] || ({}));
    // 各页面内容
    const fn = {
      overview: pageOverview, news: pageNews, product: pageProducts, tech: pageTech, supply: pageSupply,
      selfrnd: pageSelfRnd,
      market: pageMarket, company: pageCompany, finance: pageFinance, rivals: pageRivals,
      hq: pageHQ,
    }[tab];
    if (fn) content.innerHTML = fn();
    // 新手引导横幅：插在页面头部之后
    const g = advanceGuide(state);
    if (g) {
      const banner = document.createElement('div');
      banner.className = 'card guide-banner';
      banner.innerHTML = `<div class="between">
          <span>💡 <b>${g.title}</b> <span class="dim tiny">${g.text}</span></span>
          <button class="btn tiny ghost" data-act="guide-skip">关闭引导</button>
        </div>
        ${g.target?.tab && g.target.tab !== tab ? `<button class="btn small primary" style="margin-top:7px" data-act="goto" data-tab="${g.target.tab}">前往「${PAGES.find((p) => p.id === g.target.tab)?.name || ''}」</button>` : ''}`;
      const ph = content.querySelector('.page-head');
      if (ph) ph.after(banner);
    }
    // 中后期系统提示（一次性，知道后不再出现）
    const hint = advanceHints(state);
    if (hint) {
      const hb = document.createElement('div');
      hb.className = 'card guide-banner hint';
      hb.innerHTML = `<div class="between">
          <span>📌 <b>${hint.title}</b> <span class="dim tiny">${hint.text}</span></span>
          <button class="btn tiny ghost" data-act="hint-dismiss" data-hint="${hint.id}">知道了</button>
        </div>`;
      const anchor = content.querySelector('.guide-banner') || content.querySelector('.page-head');
      if (anchor) anchor.after(hb);
    }
    content.scrollTop = tabChanged ? 0 : keepScroll;
    prevTab = tab;
    if (tab === 'hq') mountOffice();
    if (tab === 'overview') drawSpark();
  }

  function pageShell(page) {
    return `<div class="page-head"><h1>${page.name}</h1><div class="sub">${fmtDate(state.date)}</div></div>`;
  }

  function head(title, sub, right = '') {
    return `<div class="page-head"><h1>${title}</h1><div class="sub">${sub}</div><div class="spacer"></div>${right}</div>`;
  }

  // ---------- 通知与新闻：左「公司内部通知」/ 右「外部信息新闻」 ----------
  const NEWS_INTERNAL_TYPES = ['star', 'group', 'award'];
  const LOG_INTERNAL = ['hr', 'rnd', 'tech', 'finance', 'product', 'company', 'build', 'guide', 'system', 'good', 'bad', 'warn'];
  const LOG_EXTERNAL = ['rival', 'market'];

  function pageNews() {
    const news = state.news || [];
    const log = state.log || [];
    const internalNews = news.filter((n) => NEWS_INTERNAL_TYPES.includes(n.type));
    const externalNews = news.filter((n) => !NEWS_INTERNAL_TYPES.includes(n.type));
    const internalLog = log.filter((l) => LOG_INTERNAL.includes(l.type)).slice(0, 60);
    const externalLog = log.filter((l) => LOG_EXTERNAL.includes(l.type)).slice(0, 60);
    const unread = news.filter((n) => !n.read).length;
    const chipOf = (t) => t === 'competitor' ? ['对手', '#f56b6b'] : t === 'attack' ? ['攻击', '#f56b6b']
      : t === 'award' ? ['奖项', '#f5a542'] : t === 'star' ? ['员工', '#7de3b0'] : t === 'group' ? ['集团', '#8fd0ff'] : ['消息', '#4aa3ff'];
    const newsRow = (n) => {
      const [label, col] = chipOf(n.type);
      return `<div class="list-item" style="align-items:flex-start;${n.read ? 'opacity:.55' : ''}">
        <div style="flex:1;min-width:0">
          <div class="between"><b class="tiny">${esc(n.title)}</b><span class="tiny dim mono">${esc(n.time || '')}</span></div>
          ${n.text ? `<div class="tiny dim" style="margin-top:2px">${esc(n.text)}</div>` : ''}
        </div>
        <span class="chip tiny" style="border-color:${col}55;color:${col};flex-shrink:0">${label}</span>
      </div>`;
    };
    const logRow = (l) => `<div class="tiny" style="line-height:1.7;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04)">
      <span class="dim mono">${esc(l.t)}</span>
      <span class="${l.type === 'bad' || l.type === 'rival' ? 'warn' : l.type === 'good' ? 'good' : ''}"> ${esc(l.text)}</span>
    </div>`;
    return `
      ${head('通知与新闻', `内部 ${internalNews.length + internalLog.length} 条 · 外部 ${externalNews.length + externalLog.length} 条`,
        unread ? `<button class="btn small" data-act="news-read-all">全部标为已读（${unread}）</button>` : '<span class="chip good">全部已读</span>')}
      <div class="two-col" style="align-items:start">
        <div class="card">
          <div class="card-title">公司内部通知 <span class="right">人事 · 研发 · 财务 · 集团</span></div>
          <div class="list">
            ${internalNews.slice(0, 40).map(newsRow).join('') || ''}
            ${internalNews.length ? '<div class="section-label">运营日志</div>' : ''}
            ${internalLog.map(logRow).join('') || (internalNews.length ? '' : '<div class="empty">暂无内部通知</div>')}
          </div>
        </div>
        <div class="card">
          <div class="card-title">外部信息新闻 <span class="right">竞品动态 · 市场消息</span></div>
          <div class="list">
            ${externalNews.slice(0, 40).map(newsRow).join('') || ''}
            ${externalNews.length ? '<div class="section-label">行业动态</div>' : ''}
            ${externalLog.map(logRow).join('') || (externalNews.length ? '' : '<div class="empty">暂无外部新闻</div>')}
          </div>
        </div>
      </div>`;
  }

  function pageOverview() {
    const r = lastReport;
    const share = avgShare(state);
    const rev12 = sum(state.history.slice(-12), (h) => h.revenue);
    const models = state.models.filter((m) => m.status === 'production');
    const activeResearch = state.tech.researching ? TECH_MAP[state.tech.researching.techId] : null;
    return `
      ${head('公司总览', `${state.company.name} · 创立于 ${state.company.founded} 年 · ${COUNTRIES.find((c) => c.id === state.company.country)?.name || ''}`,
        `<button class="btn small" data-act="open-report">月度报表</button>`)}
      <div class="kpi-row">
        <div class="kpi"><div class="k">现金</div><div class="v ${state.company.cash < 0 ? 'bad' : ''}">${fmtMoney(state.company.cash)}</div><div class="d ${(r?.net || 0) >= 0 ? 'good' : 'bad'}">${r ? (r.net >= 0 ? '+' : '') + fmtMoney(r.net) + ' / 月' : '等待首个结算'}</div></div>
        <div class="kpi"><div class="k">公司估值</div><div class="v">${fmtMoney(state.company.valuation)}</div><div class="d dim">负债 ${fmtMoney(state.company.debt)}</div></div>
        <div class="kpi"><div class="k">近 12 月营收</div><div class="v">${fmtMoney(rev12)}</div><div class="d dim">月均 ${fmtMoney(rev12 / 12)}</div></div>
        <div class="kpi"><div class="k">全球份额</div><div class="v">${(share * 100).toFixed(2)}%</div><div class="d dim">${models.length} 款在售</div></div>
        <div class="kpi"><div class="k">品牌力</div><div class="v">${state.company.brand.toFixed(1)}</div><div class="d dim">口碑 ${state.company.reputation.toFixed(0)}</div></div>
        <div class="kpi"><div class="k">员工</div><div class="v">${state.employees.length}</div><div class="d dim">月薪支出 ${fmtMoney(sum(state.employees, (e) => e.salary))}</div></div>
      </div>

      ${(() => {
        const ir = industryRating(state);
        return `<div class="card" style="margin-bottom:12px">
          <div class="between">
            <div class="row" style="gap:9px"><b>行业评价</b><span class="chip accent">全球第 ${ir.rank} / ${ir.rankTotal}</span></div>
            <span class="tiny dim">${ir.score} / 100</span>
          </div>
          <div class="between" style="margin:6px 0 3px">
            <b style="font-size:20px">${ir.tier.icon} ${ir.tier.name}</b>
            <span class="tiny ${ir.next ? 'muted' : 'good'}">${ir.next ? `距「${ir.next.name}」还差 ${ir.nextGap} 分` : '已达最高段位'}</span>
          </div>
          <div class="bar"><i style="width:${ir.score}%"></i></div>
          <div class="tiny dim" style="margin:4px 0 8px">${esc(ir.tier.desc)}</div>
          ${ir.dims.map((x) => `<div class="between tiny" style="line-height:2">
            <span class="dim">${x.name}</span>
            <span style="flex:1;margin:0 10px"><span class="bar" style="display:inline-block;width:100%"><i style="width:${Math.round((x.pts / x.max) * 100)}%"></i></span></span>
            <span class="muted">${Math.round(x.pts)}/${x.max} · ${esc(x.hint)}</span>
          </div>`).join('')}
        </div>`;
      })()}
      ${(() => {
        const mp = milestoneProgress(state);
        return `<div class="card" style="margin-bottom:12px">
          <div class="between">
            <div class="row" style="gap:9px"><b>发展阶段</b><span class="chip accent">${mp.done} / ${mp.total}</span></div>
            <span class="tiny ${mp.next ? 'muted' : 'good'}">${mp.next ? `下一目标：${mp.next.name} · ${mp.next.desc}` : '七个里程碑全部达成，你已经是行业巨头。'}</span>
          </div>
          <div class="ms-row">
            ${MILESTONES.map((m) => {
              const at = state.milestones && state.milestones[m.id];
              return `<div class="ms ${at ? 'on' : ''} ${mp.next && mp.next.id === m.id ? 'next' : ''}" title="${esc(m.desc)}">
                <i>${at ? '✓' : ''}</i><span>${esc(m.name)}</span>
                ${at ? `<em>${at.year}.${String(at.month + 1).padStart(2, '0')}</em>` : ''}
              </div>`;
            }).join('')}
          </div>
        </div>`;
      })()}

      <div class="two-col">
        <div class="grid" style="gap:12px">
          <div class="card">
            <div class="card-title">现金与营收趋势 <span class="right">近 48 个月</span></div>
            <div class="chart-wrap"><canvas id="spark"></canvas></div>
          </div>
          <div class="card">
            <div class="card-title">在售产品</div>
            ${models.length ? `<table class="tbl">
              <thead><tr><th>机型</th><th class="num">月销量</th><th class="num">售价</th><th class="num">评分</th><th class="num">库存</th><th class="num">毛利/台</th></tr></thead>
              <tbody>${models.map((m) => {
                const p = m.price.cn || suggestedPrice(state, m, 'cn');
                const c = unitCost(state, m);
                return `<tr class="clickable" data-act="goto" data-tab="product">
                  <td><b>${esc(m.name)}</b></td>
                  <td class="num">${fmtNum(m.lastSold || 0)}</td>
                  <td class="num">¥${fmtNum(p)}</td>
                  <td class="num">${m.rating || '—'}</td>
                  <td class="num">${fmtNum(m.inventory)}</td>
                  <td class="num ${p - c > 0 ? 'good' : 'bad'}">¥${fmtNum(p - c)}</td>
                </tr>`;
              }).join('')}</tbody>
            </table>` : '<div class="empty">还没有在售产品<br/><button class="btn small primary" data-act="create-model">设计第一款手机</button></div>'}
          </div>
        </div>

        <div class="grid" style="gap:12px">
          <div class="card">
            <div class="card-title">研发中</div>
            ${activeResearch ? `
              <div class="between"><b>${activeResearch.name}</b><span class="chip accent">${state.tech.researching.progress.toFixed(1)}%</span></div>
              <div class="bar" style="margin:9px 0 6px"><i style="width:${state.tech.researching.progress}%"></i></div>
              <div class="tiny dim">月预算 ${fmtMoney(researchBudget(state))} · 研发人力 ${staffPower(state, 'rnd').toFixed(1)} 标准人</div>
            ` : `<div class="empty" style="padding:18px">没有进行中的项目<br/><button class="btn small" data-act="goto" data-tab="tech">前往科技研发</button></div>`}
          </div>
          <div class="card">
            <div class="card-title">近期事件</div>
            <div class="list" style="max-height:250px;overflow:auto">
              ${state.log.slice(0, 8).map((l) => `
                <div class="tiny" style="line-height:1.6">
                  <span class="dim mono">${l.t}</span>
                  <span class="${l.type === 'bad' ? 'bad' : l.type === 'good' ? 'good' : l.type === 'rival' ? 'warn' : ''}"> ${esc(l.text)}</span>
                </div>`).join('') || '<div class="dim tiny">暂无事件</div>'}
            </div>
          </div>
          <div class="card">
            <div class="card-title">快捷操作</div>
            <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px">
              <button class="btn" data-act="goto" data-tab="product">设计手机</button>
              <button class="btn" data-act="goto" data-tab="tech">科技研发</button>
              <button class="btn" data-act="goto" data-tab="supply">安排生产</button>
              <button class="btn" data-act="goto" data-tab="market">调整定价</button>
            </div>
            ${state.events.length ? `<div class="section-label">当前影响</div>${state.events.map((e) => `<div class="tiny" style="margin-bottom:4px"><span class="chip ${e.kind === 'good' ? 'good' : 'bad'}">${e.title}</span> <span class="dim">剩 ${e.months} 月</span></div>`).join('')}` : ''}
          </div>
        </div>
      </div>`;
  }

  function drawSpark() {
    const cv = content.querySelector('#spark');
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    const hist = historyRows(state, 48);
    if (hist.length < 2) {
      ctx.fillStyle = '#66707f'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('推进时间后显示趋势', w / 2, h / 2);
      return;
    }
    const padL = 10, padR = 12, padT = 30, padB = 16;
    const x = (i) => padL + (i / (hist.length - 1)) * (w - padL - padR);
    const series = [
      { key: 'cash', name: '现金', color: '#4aa3ff' },
      { key: 'revenue', name: '营收', color: '#37c9a5' },
    ];

    // 网格
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const gy = padT + (i / 3) * (h - padT - padB);
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(w - padR + 4, gy); ctx.stroke();
    }

    // 图例（含当前值，避免线尾标签互相压住）
    let lx = padL;
    for (const s0 of series) {
      ctx.fillStyle = s0.color;
      ctx.beginPath(); ctx.arc(lx + 3, 13, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#9aa6b6';
      ctx.fillText(s0.name, lx + 11, 17);
      const last = Math.max(0, hist[hist.length - 1][s0.key] || 0);
      ctx.fillStyle = s0.color;
      ctx.fillText(fmtMoney(last), lx + 11 + ctx.measureText(s0.name).width + 7, 17);
      lx += 11 + ctx.measureText(s0.name).width + 7 + ctx.measureText(fmtMoney(last)).width + 22;
    }

    // 两条线各自归一化，避免量级差把营收压成直线
    for (const s0 of series) {
      const vals = hist.map((d) => Math.max(0, d[s0.key] || 0));
      const max = Math.max(...vals, 1);
      const y = (v) => h - padB - (Math.max(0, v) / max) * (h - padT - padB);
      ctx.beginPath();
      hist.forEach((d, i) => {
        const px = x(i), py = y(d[s0.key]);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.strokeStyle = s0.color;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.stroke();
      // 末端点
      ctx.fillStyle = s0.color;
      ctx.beginPath(); ctx.arc(x(hist.length - 1), y(vals[vals.length - 1]), 2.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  function pageProducts() {
    const allModels = state.models;
    const prodCounts = {
      all: allModels.length,
      pending: allModels.filter((m) => m.status === 'production' && !m.released).length,
      sale: allModels.filter((m) => m.status === 'production' && m.released !== false).length,
      out: allModels.filter((m) => m.status === 'discontinued').length,
      draft: allModels.filter((m) => m.status === 'draft').length,
    };
    const models = prodFilter === 'all' ? allModels : allModels.filter((m) => {
      if (prodFilter === 'pending') return m.status === 'production' && !m.released;
      if (prodFilter === 'sale') return m.status === 'production' && m.released !== false;
      if (prodFilter === 'out') return m.status === 'discontinued';
      if (prodFilter === 'draft') return m.status === 'draft';
      return true;
    });
    // 产品线总览：按定位分组对比 + 经营建议
    const lineOverview = (() => {
      const prod = models.filter((m) => m.status === 'production' && m.released !== false);
      if (prod.length < 1) return '';
      const rows = LINEUPS.map((lu) => {
        const ms = prod.filter((m) => (m.lineup || 'main') === lu.id);
        if (!ms.length) return '';
        const units = sum(ms, (m) => m.lastSold || 0);
        const rev = sum(ms, (m) => m.lastSold * (m.price?.cn || 0));
        const rating = ms.length ? sum(ms, (m) => m.rating || 55) / ms.length : 0;
        const inv = sum(ms, (m) => m.inventory || 0);
        const stale = ms.filter((m) => (m.lastSold || 0) < 50 && inv > 3000);
        return `<tr>
          <td>${lu.icon} ${lu.name}</td>
          <td>${ms.map((m) => esc(m.name)).join('、')}</td>
          <td class="mono">${fmtNum(units)}</td>
          <td class="mono">${fmtMoney(rev)}</td>
          <td class="mono">${Math.round(rating)}</td>
          <td class="mono">${fmtNum(inv)}</td>
          <td class="tiny ${stale.length ? 'warn' : 'dim'}">${stale.length ? `${esc(stale[0].name)} 滞销，建议降价清仓或下市` : '健康'}</td>
        </tr>`;
      }).join('');
      return `<div class="card" style="margin-bottom:12px">
        <div class="card-title">产品线总览 <span class="right">按定位分组对比 · 识别滞销机型</span></div>
        <div style="overflow:auto"><table class="tbl" style="width:100%;min-width:640px">
          <thead><tr><th>产品线</th><th>在售机型</th><th>上月销量</th><th>月销售额</th><th>均分</th><th>库存</th><th>建议</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
    })();
    return `
      ${head('设计与产品', '从零设计一款手机，2D 六视图与 3D 模型实时同步',
        `<button class="btn primary small" data-act="open-lineup">+ 新建机型</button>
         <button class="btn small" data-act="open-screendesign">屏幕设计</button>`)}
      <div class="filter-row">
        ${[['all', '全部'], ['pending', '待发布'], ['sale', '在售'], ['out', '已退市'], ['draft', '设计中']].map(([id, name]) => `<button class="btn small ${prodFilter === id ? 'primary' : 'ghost'}" data-act="prod-filter" data-v="${id}">${name} <span class="tiny dim">${prodCounts[id]}</span></button>`).join('')}
      </div>
      ${prodCounts.pending ? `<div class="next-step">
        <b>${prodCounts.pending} 款机型已量产，等待发布</b>
        <span class="tiny dim">发布后才开始销售。一场发布会可同时发布多款。</span>
        <button class="btn small primary" data-act="open-stage" data-id="${allModels.find((m) => m.status === 'production' && !m.released)?.id || ''}">去发布</button>
      </div>` : ''}
      ${lineOverview}
      ${models.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">
        ${(() => {
          const serOf = (mm) => mm.series || String(mm.name || '').trim().split(/\s+/)[0] || '其他';
          const firstIdx = new Map();
          models.forEach((mm, ii) => { const s2 = serOf(mm); if (!firstIdx.has(s2)) firstIdx.set(s2, ii); });
          const multi = new Set(models.map(serOf)).size > 1;
          return models.map((m, gi) => {
            const ser = serOf(m);
          const d = derive(m.design, state.date.year);
          const sandboxAll = state.mode === 'sandbox' && state.tech.all;
          const v = validate(m.design, state.date.year,
            sandboxAll ? { ignoreEra: true, unlocked: state.tech.unlocked } : { unlocked: state.tech.unlocked });
          const statusMap = { draft: ['设计中', 'warn'], production: m.released ? ['在售', 'good'] : ['待发布', 'warn'], discontinued: ['已下市', ''] };
          const st = statusMap[m.status] || ['未知', ''];
          const bw = 58, bh = Math.round(clamp(58 * (m.design.body.length / m.design.body.width), 96, 150));
          const camOn = (CAMERAS.find((c) => c.id === m.design.camera.part) || {}).mp > 0;
          return `${firstIdx.get(ser) === gi && multi ? `<div class="card" data-act="series-fold" data-v="${esc(ser)}" style="grid-column:1/-1;padding:7px 12px;background:rgba(74,163,255,.05);border-color:rgba(143,208,255,.25);cursor:pointer"><b class="tiny" style="color:#8fd0ff">系列 · ${esc(ser)}</b><span class="tiny dim" style="margin-left:8px">${models.filter((mm) => serOf(mm) === ser).length} 款机型</span><span class="tiny dim" style="float:right">${foldedSeries.has(ser) ? '▸ 已折叠' : '▾ 收起'}</span></div>` : ''}
            <div class="card" style="${foldedSeries.has(ser) ? 'display:none' : ''}">
            <div class="row" style="gap:12px;align-items:flex-start;margin-bottom:10px">
              <img class="phone-thumb" alt="外观" src="${phoneFrontDataUrl(m.design, bw)}" style="width:${bw}px;height:${bh}px;object-fit:cover;border-radius:12px;background:#0b0f15;border:1px solid rgba(255,255,255,.08)" />
              <div style="flex:1;min-width:0">
                <div class="between">
                  <div style="font-size:15px;font-weight:650">${esc(m.name)}</div>
                  <span class="chip ${st[1]}">${st[0]}</span>
                </div>
                <div class="row" style="gap:6px;margin:4px 0 6px;flex-wrap:wrap">
                  <button class="chip" data-act="open-lineup" data-lineup-target="${m.id}"
                    title="调整产品线">${(LINEUP_MAP[m.lineup] || LINEUP_MAP.main).icon} ${(LINEUP_MAP[m.lineup] || LINEUP_MAP.main).name}</button>
                  ${m.review ? `<span class="chip ${m.review.user >= 60 ? 'good' : m.review.user >= 45 ? 'warn' : 'bad'}">用户 ${m.review.user}</span>` : ''}
                  ${m.review ? `<span class="chip">媒体 ${m.review.media}</span>` : ''}
                </div>
                <div class="tiny dim">${m.launched ? `${m.launched.year}年${m.launched.month + 1}月上市` : `创建于 ${state.date.year} 年`}</div>
                <div class="tiny dim">${m.design.body.length}×${m.design.body.width}×${m.design.body.thickness}mm · ${m.design.screen.inch}″</div>
              </div>
            </div>
            <div class="grid" style="grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px">
              ${[['性能', d.perf], ['影像', d.camera], ['续航', d.battery], ['设计', d.designScore]].map(([k, val]) => `
                <div style="background:#121821;border-radius:8px;padding:7px 6px;text-align:center">
                  <div class="tiny dim">${k}</div><div class="mono" style="font-size:15px;font-weight:650">${Math.round(val)}</div>
                </div>`).join('')}
            </div>
            <div class="tiny" style="line-height:1.9">
              <div class="between"><span class="dim">整机成本</span><b class="warn">¥${fmtNum(unitCost(state, m))}</b></div>
              <div class="between"><span class="dim">建议零售</span><b>¥${fmtNum(m.price.cn || suggestedPrice(state, m, 'cn'))}</b></div>
              ${m.status === 'production' ? `<div class="between"><span class="dim">上月销量 / 库存</span><b>${fmtNum(m.lastSold || 0)} / ${fmtNum(m.inventory)}</b></div>` : ''}
              ${m.status === 'production' ? `<div class="between"><span class="dim">产品热度</span>
                <div class="bar" style="width:42%;height:8px"><div style="width:${Math.min(100, m.heat === undefined ? (m.released ? 100 : 55) : Math.round(m.heat))}%;height:100%;background:${(m.heat === undefined ? 100 : m.heat) > 60 ? '#37c9a5' : (m.heat === undefined ? 100 : m.heat) > 30 ? '#f5a542' : '#f56b6b'}"></div></div>
                ${(() => { const h = m.heat === undefined ? (m.released ? 100 : 55) : m.heat; const st = h >= 100 ? '爆款' : h >= 78 ? '上市爆发' : h >= 55 ? '高峰期' : h >= 35 ? '稳定期' : h >= 20 ? '衰退期' : '过时清仓'; const col = h > 55 ? '#37c9a5' : h > 30 ? '#f5a542' : '#f56b6b'; return `<span class="chip" style="border-color:${col}55;color:${col}">${st}</span>`; })()}
                <b class="mono tiny">${Math.round(m.heat === undefined ? (m.released ? 100 : 55) : m.heat)}</b></div>` : ''}
              ${(m.design?.variants || []).length ? `<div class="between" style="align-items:flex-start"><span class="dim">配置版本</span><span class="tiny" style="text-align:right;line-height:1.7">${m.design.variants.map((v) => {
                const r = RAMS.find((x) => x.id === v.ram), st = STORAGES.find((x) => x.id === v.stg);
                const gb = (g) => g >= 1 ? `${Math.round(g * 10) / 10}G` : `${Math.round(g * 1024)}M`;
                return `${gb(r?.gb || 0)}+${gb(st?.gb || 0)}${v.price?.cn ? ` · ¥${fmtNum(v.price.cn)}` : ''}${m.status === 'production' ? ` · ${fmtNum(v.sold || 0)}台` : ''}`;
              }).join('<br/>')}</span></div>` : ''}
              ${m.review ? `<div class="between"><span class="dim">故障率 / 退货率</span><b class="${m.review.defect > 0.05 ? 'warn' : ''}">${(m.review.defect * 100).toFixed(1)}% / ${(m.review.returns * 100).toFixed(1)}%</b></div>` : ''}
            </div>
            ${!v.ok ? `<div class="issue error" style="margin-top:8px">${v.issues.filter((i) => i.level === 'error').length} 项设计问题，无法量产</div>` : ''}
            ${(m.awards || []).length ? `<div class="row wrap" style="gap:5px;margin-top:8px">
              ${(m.awards || []).map((a) => `<span class="chip" style="border-color:rgba(245,165,66,.5);color:#f5a542">🏆 ${esc(a.name)} · ${a.year}</span>`).join('')}
            </div>` : ''}
            ${(m.comments || []).length ? `<div class="tiny dim" style="margin-top:8px;line-height:1.8">
              <span style="color:#8fd0ff">用户评论</span><br/>
              ${(m.comments || []).map((c) => `<span>“${esc(c)}”</span>`).join('<br/>')}
            </div>` : ''}
            <div class="row wrap" style="margin-top:10px;gap:6px">
              <button class="btn small" data-act="design" data-id="${m.id}">设计</button>
              <button class="btn small ghost" data-act="rename-model" data-id="${m.id}" title="按「系列 代数 版本」规范命名">✏️ 改名</button>
              <button class="btn small" data-act="open-poster" data-id="${m.id}">🖼 宣传图</button>
              <button class="btn small" data-act="clone-model" data-id="${m.id}" title="复制此设计为同系列新机型（Pro / Pro Max / Ultra 等）">⧉ 复制为新机型</button>
              ${m.status === 'draft' ? `<button class="btn small primary" data-act="launch" data-id="${m.id}" ${!v.ok ? 'disabled' : ''}>量产上市</button>` : ''}
              ${m.status === 'production' ? `<button class="btn small" data-act="goto" data-tab="market">定价</button>${!m.released ? `<button class="btn small primary" data-act="open-stage" data-id="${m.id}">发布产品</button>` : ''}<button class="btn small danger" data-act="discontinue" data-id="${m.id}">下市</button>` : ''}
              ${m.status === 'draft' ? `<button class="btn small ghost danger" data-act="delete-model" data-id="${m.id}">删除</button>` : ''}
            </div>
          </div>`;
        }).join('');
        })()}
      </div>` : `<div class="card"><div class="empty">
        ${allModels.length ? '该分类下暂无机型。<br/>切换到「全部」查看其他机型。' : `还没有任何机型。<br/>
        设计系统支持：机身尺寸 / 屏幕 / 摄像头 / 材质 / 部件配置 / 内部空间校验。<br/><br/>
        <button class="btn primary" data-act="create-model">开始设计</button>`}
      </div></div>`}`;
  }

  function pageTech() {
    const r = state.tech.researching;
    const t = r ? TECH_MAP[r.techId] : null;
    return `
      ${head('科技研发', '技术必须按年代与前置关系推进，无法在 1980 年造出折叠屏',
        r ? `<button class="btn small danger" data-act="cancel-research">取消项目</button>` : '')}
      ${t ? `<div class="card" style="margin-bottom:12px">
        <div class="between"><div><b>${t.name}</b> <span class="chip accent">研发中</span></div><span class="mono">${r.progress.toFixed(1)}%</span></div>
        <div class="bar" style="margin:10px 0 8px"><i style="width:${r.progress}%"></i></div>
        <div class="row tiny dim wrap" style="gap:14px">
          <span>月预算 ${fmtMoney(researchBudget(state))}</span>
          <span>研发人力 ${staffPower(state, 'rnd').toFixed(1)}</span>
          <span>预计还需 ${Math.max(1, Math.ceil((100 - r.progress) / Math.max(0.2, progressPerMonth()))) } 个月</span>
          <span>累计投入 ${fmtMoney(r.spent)}</span>
        </div>
      </div>` : ''}
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">技术引进 <span class="right">直接购买竞品成熟技术 · 立即到手 · 价格高于自研</span></div>
        ${(() => {
          const offs = techOffers(state);
          if (!offs.length) return '<div class="tiny dim">当前没有可引进的技术（都已掌握或前置未满足）。</div>';
          return offs.map((o) => `
            <div class="between" style="padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06);gap:10px">
              <div style="min-width:0"><b class="tiny">${o.name}</b> <span class="tiny dim">${o.year} 年 · ${o.seller} 出售</span>
                <div class="tiny dim">${o.desc}</div></div>
              <button class="btn small" data-act="buy-tech" data-id="${o.techId}" ${state.company.cash < o.price ? 'disabled' : ''}>引进（${fmtMoney(o.price)}）</button>
            </div>`).join('');
        })()}
      </div>
      <div class="kpi-row">
        <div class="kpi"><div class="k">已掌握技术</div><div class="v">${state.tech.unlocked.length}<span class="tiny dim"> / ${TECHS.length}</span></div></div>
        <div class="kpi"><div class="k">研发人力</div><div class="v">${staffPower(state, 'rnd').toFixed(1)}</div><div class="d dim">${state.employees.filter((e) => e.deptId === 'rnd').length} 人</div></div>
        <div class="kpi"><div class="k">在研项目</div><div class="v">${t ? t.name : '无'}</div></div>
        <div class="kpi"><div class="k">年度研发投入</div><div class="v">${fmtMoney((t ? researchBudget(state) : 0) * 12)}</div></div>
      </div>
      ${(() => {
        if (t) return '';
        const readyNow = TECHS.filter((x) => techState(x, state.date.year, state.tech.unlocked, state.tech.researching) === 'ready');
        if (readyNow.length) return '';
        const future = TECHS.filter((x) => x.year > state.date.year).sort((a, b) => a.year - b.year)[0];
        return `<div class="card" style="margin-bottom:12px;border-color:rgba(255,255,255,.08)">
          <div class="between"><b>暂无可以立项的技术</b><span class="chip">${future ? `${future.year} 年` : '—'}</span></div>
          <div class="tiny dim" style="margin-top:6px">${future ? `这一年能做的技术都已在手，行业下一个节点是 ${future.year} 年的「${future.name}」。先把现有产品卖好。` : '所有技术都已掌握。'}</div>
        </div>`;
      })()}
      ${TECH_CATS.map((cat) => `
        <div class="tech-cat">
          <h3><span style="width:8px;height:8px;border-radius:2px;background:${cat.color};display:inline-block"></span>${cat.name}</h3>
          <div class="tech-grid">
            ${TECHS.filter((x) => x.cat === cat.id).map((x) => {
              const st = techState(x, state.date.year, state.tech.unlocked, state.tech.researching);
              const label = { done: '已掌握', doing: '研发中', future: `${x.year} 年`, locked: '需前置', route: '已选另一路线', ready: `研发 ${fmtMoney(x.cost)}` }[st];
              return `<div class="tech-node ${st}" ${st === 'ready' ? `data-act="research" data-id="${x.id}"` : ''}>
                <div class="tname">${x.name}</div>
                <div class="tmeta"><span>${x.year}</span><span>${label}</span></div>
                ${st === 'doing' ? `<div class="prog" style="width:${state.tech.researching.progress}%"></div>` : ''}
              </div>`;
            }).join('')}
          </div>
        </div>`).join('')}`;
  }

  function progressPerMonth() {
    const r = state.tech.researching;
    if (!r) return 0;
    const t = TECH_MAP[r.techId];
    const country = COUNTRIES.find((c) => c.id === state.company.country) || COUNTRIES[0];
    const power = staffPower(state, 'rnd');
    return Math.pow(Math.max(power, 0.15), 0.9) * 2600 * country.tech / t.cost * 100;
  }

  function pageSupply() {
    const cap = capacityOf(state);
    const models = state.models.filter((m) => m.status !== 'draft');
    const inProd = models.filter((m) => m.status === 'production');
    const used = sum(models, (m) => m.productionTarget || 0);
    const unit = models[0] ? unitCost(state, models[0]) : 0;
    const sup = ensureSupply(state);
    const lead = Math.min(...COMPONENTS.map((c) => leadTime(state, c.id, staffPower(state, 'supply'))));
    const cover = inProd[0] ? stockCoverage(state, inProd[0]) : { units: 0, bottleneck: null, need: {} };
    const health = inProd[0] ? supplyHealth(state, inProd[0]) : { label: '暂无在产机型', tone: '', ratio: 0 };
    const turn = turnoverDays(state);
    const spotCost = lastReport?.spotCost || 0;
    return `
      ${head('生产供应链', `当前产能 ${fmtUnit(cap)}（${state.production.mode === 'own' ? '自建产线' : '委托代工'}）· 已排产 ${fmtUnit(used)}`,
        `<button class="btn small primary" data-act="auto-production">智能匹配排产</button>
         <button class="btn small" data-act="goto" data-tab="hq">园区与产线</button>`)}
      <div class="kpi-row">
        <div class="kpi"><div class="k">自有产能</div><div class="v">${fmtUnit(factoryCapacity(state))}</div><div class="d dim">${ownFactoryCount(state)} 座生产基地</div></div>
        <div class="kpi"><div class="k">元器件覆盖</div><div class="v ${health.tone}">${fmtUnit(cover.units)}</div><div class="d dim">${health.label}${cover.bottleneck ? ` · 瓶颈 ${COMPONENT_MAP[cover.bottleneck].name}` : ''}</div></div>
        <div class="kpi"><div class="k">库存周转</div><div class="v">${turn == null ? '—' : turn + ' 天'}</div><div class="d dim">在途 ${fmtNum(sup.orders.reduce((a, o) => a + o.qty, 0))} 件</div></div>
        <div class="kpi"><div class="k">上月急采溢价</div><div class="v ${spotCost > 0 ? 'warn' : 'good'}">${spotCost > 0 ? fmtMoney(spotCost) : '无'}</div><div class="d dim">${lastReport?.spotUnits ? `${fmtUnit(lastReport.spotUnits)} 台缺料` : '排产全部由库存覆盖'}</div></div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="between" style="margin-bottom:10px;gap:12px">
          <b>元器件采购</b>
          <div class="row" style="gap:12px">
            <span class="tiny dim">供应商交期最短 ${lead} 个月</span>
            <label class="row tiny" style="gap:6px;cursor:pointer">
              <input type="checkbox" ${sup.auto ? 'checked' : ''} data-field="auto-supply" /> 自动补货（按两月用量）
            </label>
          </div>
        </div>
        <table class="tbl">
          <thead><tr><th>元器件</th><th class="num">库存</th><th class="num">在途</th><th>供应商</th><th class="num">下单</th><th></th></tr></thead>
          <tbody>
            ${COMPONENTS.map((c) => {
              const st = sup.stock[c.id] || 0;
              const tr = inTransit(state, c.id);
              const board = supplierBoard(state, c.id, staffPower(state, 'supply'));
              const lastOrder = sup.orders.filter((o) => o.cat === c.id).at(-1);
              const sel = lastOrder?.supplierId || board[0]?.id;
              const need = cover.need?.[c.id] || 0;
              // 按月度消耗折算天数；没排产就按半产能估算，避免除以 1 台算出「18 万天」
              const plan = used > 0 ? used : Math.round(cap * 0.5);
              const burn = need * plan;
              const days = burn > 0 && st > 0 ? Math.round((st / burn) * 30) : null;
              const suggest = Math.max(1000, Math.round((burn * 2) / 1000) * 1000);
              const cur = board.find((b) => b.id === sel) || board[0];
              return `<tr>
                <td><b>${c.icon} ${c.name}</b><div class="tiny dim">${c.desc}</div></td>
                <td class="num">
                  ${st > 0 ? `<b>${fmtNum(st)}</b><div class="tiny dim">${days == null ? '—' : `约 ${days} 天用量`}</div>` : '<span class="chip bad">断料</span>'}
                </td>
                <td class="num">${tr ? fmtNum(tr) : '<span class="dim">—</span>'}</td>
                <td style="min-width:190px">
                  <select data-supplier="${c.id}">
                    ${board.map((b) => `<option value="${b.id}" ${b.id === sel ? 'selected' : ''}>${b.name} · ×${b.priceMul.toFixed(2)} · ${b.lead}个月</option>`).join('')}
                  </select>
                  ${cur?.disrupted ? `<div class="tiny bad">断供中：还剩 ${cur.monthsLeft} 个月</div>` : `<div class="tiny dim">可靠率 ${Math.round((cur?.reliability || 0.9) * 100)}%</div>`}
                </td>
                <td class="num" style="width:130px">
                  <input type="number" min="0" step="5000" value="${suggest}" data-order="${c.id}" />
                </td>
                <td class="num"><button class="btn small" data-act="order-comp" data-cat="${c.id}">下单</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        ${disruptionList(state).length ? `
        <div style="margin-top:10px;padding:9px 12px;border-radius:9px;background:rgba(245,107,143,.08);border:1px solid rgba(245,107,143,.3)">
          ${disruptionList(state).map((d) => `<div class="tiny"><b class="bad">⛔ ${d.supplier.name} 断供</b>（${d.reason}）· 还剩 ${d.monthsLeft} 个月，向该家下的订单交期 +1 个月</div>`).join('')}
        </div>` : ''}
        <div class="tiny dim" style="margin-top:10px">
          元器件到货后才能用于生产：库存不足的部分会走现货市场，物料成本上浮 ${Math.round(SPOT_PREMIUM * 100)}%。
          便宜的供应商更慢也更容易断供；供应链人力越强交期越短（当前 ${staffPower(state, 'supply').toFixed(1)}）。
        </div>
      </div>

      <div class="two-col">
        <div class="card">
          <div class="card-title">生产安排 <span class="right">产能利用率 ${cap ? Math.round(used / cap * 100) : 0}%</span></div>
          ${models.length ? `<table class="tbl">
            <thead><tr><th>机型</th><th>状态</th><th class="num">单机成本</th><th class="num">库存</th><th class="num">本月排产</th></tr></thead>
            <tbody>${models.map((m) => {
              const cv = stockCoverage(state, m);
              const short = m.status === 'production' && (m.productionTarget || 0) > cv.units;
              return `
              <tr>
                <td><b>${esc(m.name)}</b>${short ? '<div class="tiny warn">元器件不足以覆盖本月排产</div>' : ''}</td>
                <td>${m.status === 'production' ? '<span class="chip good">在产</span>' : '<span class="chip">停售</span>'}</td>
                <td class="num">¥${fmtNum(unitCost(state, m))}</td>
                <td class="num">${fmtNum(m.inventory)}</td>
                <td class="num" style="width:160px">
                  <input type="number" step="5000" min="0" value="${m.productionTarget || 0}" data-field="target" data-id="${m.id}" ${m.status !== 'production' ? 'disabled' : ''} />
                </td>
              </tr>`;
            }).join('')}</tbody>
          </table>
          <div class="tiny dim" style="margin-top:10px">排产过高会积压库存，过低会缺货丢单。产量受月产能与现金限制。</div>` :
          '<div class="empty">暂无可生产机型<br/><button class="btn small primary" data-act="create-model">去设计手机</button></div>'}
        </div>

        <div class="grid" style="gap:12px">
          <div class="card">
            <div class="card-title">生产模式</div>
            <div class="opt-grid" style="grid-template-columns:1fr 1fr">
              <div class="opt ${state.production.mode === 'foundry' ? 'on' : ''}" data-act="toggle-mode" data-mode="foundry">委托代工</div>
              <div class="opt ${state.production.mode === 'own' ? 'on' : ''} ${ownFactoryCount(state) ? '' : 'disabled'}" data-act="toggle-mode" data-mode="own">自建工厂</div>
            </div>
            ${state.production.mode === 'foundry' ? `
              <label class="field" style="margin-top:12px">
                <span>代工厂</span>
                <select data-field="foundry">
                  ${FOUNDRIES.map((f) => `<option value="${f.id}" ${state.production.foundryId === f.id ? 'selected' : ''}>${f.name} · ${fmtUnit(f.capacity)}/月 · 加工费 ¥${f.fee}</option>`).join('')}
                </select>
              </label>
              <div class="tiny dim">${FOUNDRIES.find((f) => f.id === state.production.foundryId)?.desc || ''}</div>
            ` : `
              <div class="tiny" style="margin-top:10px;line-height:1.9">
                <div class="between"><span class="dim">自有产能</span><b>${fmtUnit(factoryCapacity(state))}/月</b></div>
                <div class="between"><span class="dim">生产基地</span><b>${ownFactoryCount(state)} 座</b></div>
                <div class="between"><span class="dim">装配成本</span><b>¥${fmtNum(assemblyUnit(state))}/台</b></div>
              </div>
              ${ownFactoryCount(state) ? '' : '<div class="tiny warn" style="margin-top:8px">还没有工厂，先去园区买地建厂。</div>'}
            `}
          </div>
          <div class="card">
            <div class="card-title">质量与效率</div>
            <label class="field">
              <span>质量投入 <b class="mono" data-out="q">${state.production.quality}</b> / 100</span>
              <input type="range" min="0" max="100" value="${state.production.quality}" data-field="quality" data-live="q" />
            </label>
            <div class="tiny dim" style="line-height:1.8">
              更严格的质量控制会提高单位成本，但能降低故障率与售后损失。<br/>
              供应链人力：<b>${staffPower(state, 'supply').toFixed(1)}</b> · 生产人力：<b>${staffPower(state, 'prod').toFixed(1)}</b>
            </div>
            <div class="section-label">成本结构（示例）</div>
            <div class="tiny" style="line-height:1.9">
              <div class="between"><span class="dim">物料 BOM（标准）</span><b>¥${fmtNum(models[0] ? bomUnit(state, models[0]) : 0)}</b></div>
              <div class="between"><span class="dim">加工/装配</span><b>¥${fmtNum(models[0] ? assemblyUnit(state) : 0)}</b></div>
              <div class="between"><span class="dim">整机成本</span><b class="warn">¥${fmtNum(unit)}</b></div>
            </div>
          </div>
        </div>
      </div>`;
  }


  function pageMarket() {
    const models = state.models.filter((m) => m.status === 'production');
    const pending = models.filter((m) => !m.released);
    const onSale = models.filter((m) => m.released !== false);
    const totalShare = avgShare(state);
    // 各人群按"市场基础规模 × 该人群占比"加权，得到全球视角的人群份额
    const segRows = SEGMENTS.map((s) => {
      let ours = 0, w = 0;
      for (const mk of state.markets) {
        const info = marketShare(state, mk.id);
        const row = (info.segments || []).find((x) => x.id === s.id);
        if (!row) continue;
        const wt = mk.base * row.share;
        ours += row.ownShare * wt;
        w += wt;
      }
      return { seg: s, ours: w > 0 ? ours / w : 0, w };
    });
    const wSum = segRows.reduce((a, b) => a + b.w, 0) || 1;
    return `
      ${head('市场与销售', `全球份额 ${(totalShare * 100).toFixed(2)}% · ${onSale.length} 款在售${pending.length ? ` · ${pending.length} 款待发布` : ''}`,
        `<button class="btn small" data-act="goto" data-tab="rivals">竞争格局</button>
         <button class="btn small primary" data-act="open-stage" data-model="${pending[0] ? pending[0].id : ''}" ${pending.length ? '' : 'disabled'}>新品发布会（${pending.length} 款待发布）</button>`)}
      ${pending.length ? `<div class="card" style="margin-bottom:12px">
        <div class="card-title">待发布机型 <span class="right">${pending.length} 款 · 发布后才计入在售</span></div>
        <div class="list">
          ${pending.map((m) => `<div class="list-item">
            <div style="flex:1;min-width:0">
              <div class="between"><b class="tiny">${esc(m.name)}</b><span class="chip warn">待发布</span></div>
              <div class="tiny dim">建议价 ¥${fmtNum(suggestedPrice(state, m, 'cn'))} · 基础热度 ${Math.round(m.heat === undefined ? 55 : m.heat)} · 库存 ${fmtNum(m.inventory || 0)}</div>
            </div>
            <button class="btn tiny primary" data-act="open-stage" data-model="${m.id}">去发布</button>
          </div>`).join('')}
        </div>
      </div>` : ''}
      ${(() => {
        // 销量/销售额多维统计：上月 / 本季 / 本年 / 累计（用 model.history 月度记录）
        const ym = state.date.year, mm = state.date.month;
        const lastKey = ym * 12 + mm - 1;        // 上一个已结算月份
        const ly = Math.floor(lastKey / 12), lm = lastKey % 12;
        const qStart = ly * 12 + Math.floor(lm / 3) * 3; // 本季首月（以最近结算月所在季度计）
        const yStart = ly * 12;                  // 本年 1 月
        const keyOf = (h) => h.y * 12 + h.m;
        const rows = onSale.map((m) => {
          const hist = (m.history || []);
          let lastU = 0, lastR = 0, qU = 0, qR = 0, yU = 0, yR = 0;
          for (const h of hist) {
            const k = keyOf(h);
            if (k === lastKey) { lastU += h.units || 0; lastR += h.rev || 0; }
            if (k >= qStart && k <= lastKey) { qU += h.units || 0; qR += h.rev || 0; }
            if (k >= yStart && k <= lastKey) { yU += h.units || 0; yR += h.rev || 0; }
          }
          return { m, lastU, lastR, qU, qR, yU, yR, totalU: m.sold || 0, totalR: m.revenue || 0 };
        });
        const tot = rows.reduce((a, r) => ({ lastU: a.lastU + r.lastU, lastR: a.lastR + r.lastR, qU: a.qU + r.qU, qR: a.qR + r.qR, yU: a.yU + r.yU, yR: a.yR + r.yR, totalU: a.totalU + r.totalU, totalR: a.totalR + r.totalR }), { lastU: 0, lastR: 0, qU: 0, qR: 0, yU: 0, yR: 0, totalU: 0, totalR: 0 });
        const cell = (v) => fmtNum(Math.round(v || 0));
        return `<div class="card" style="margin-bottom:12px">
          <div class="card-title">机型销量与销售额 <span class="right">在售 ${onSale.length} 款 · 以 ${ly}年${lm + 1}月 为最近结算月 · 季度按自然季度</span></div>
          <div style="overflow:auto"><table class="tbl" style="width:100%;min-width:820px">
            <thead><tr>
              <th>机型</th>
              <th class="num">上月销量</th><th class="num">上月销售额</th>
              <th class="num">本季销量</th><th class="num">本季销售额</th>
              <th class="num">本年销量</th><th class="num">本年销售额</th>
              <th class="num">累计销量</th><th class="num">累计销售额</th>
            </tr></thead>
            <tbody>
              ${rows.map((r) => `<tr>
                <td>${esc(r.m.name)} ${!r.m.released ? '<span class="chip warn">待发布</span>' : ''} <span class="tiny dim">${r.m.lineup && LINEUP_MAP[r.m.lineup] ? LINEUP_MAP[r.m.lineup].name : ''}</span></td>
                <td class="num">${cell(r.lastU)}</td><td class="num">¥${fmtNum(Math.round(r.lastR))}</td>
                <td class="num">${cell(r.qU)}</td><td class="num">¥${fmtNum(Math.round(r.qR))}</td>
                <td class="num">${cell(r.yU)}</td><td class="num">¥${fmtNum(Math.round(r.yR))}</td>
                <td class="num">${cell(r.totalU)}</td><td class="num">¥${fmtNum(Math.round(r.totalR))}</td>
              </tr>`).join('') || '<tr><td colspan="9" class="dim">还没有在售机型</td></tr>'}
              <tr style="border-top:1px solid var(--line-2)">
                <td><b>合计</b></td>
                <td class="num"><b>${cell(tot.lastU)}</b></td><td class="num"><b>¥${fmtNum(Math.round(tot.lastR))}</b></td>
                <td class="num"><b>${cell(tot.qU)}</b></td><td class="num"><b>¥${fmtNum(Math.round(tot.qR))}</b></td>
                <td class="num"><b>${cell(tot.yU)}</b></td><td class="num"><b>¥${fmtNum(Math.round(tot.yR))}</b></td>
                <td class="num"><b>${cell(tot.totalU)}</b></td><td class="num"><b>¥${fmtNum(Math.round(tot.totalR))}</b></td>
              </tr>
            </tbody>
          </table></div>
        </div>`;
      })()}
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">渠道关系 <span class="right">三渠道平均关系影响全局销量 ×${channelSalesMul(state).toFixed(2)} · 每月自然滑落</span></div>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">
          ${SALES_CHANNELS.map((c) => {
            const sc = ensureSalesChannels(state)[c.id];
            const rel = Math.round(sc.rel);
            const col = rel > 70 ? '#37c9a5' : rel > 40 ? '#f5a542' : '#f56b6b';
            const cost = Math.round(600000 * (1 + rel / 40));
            return `<div class="org-exec filled" style="border-color:${col}44">
              <div class="between"><b>${c.name}</b><span class="chip" style="border-color:${col}66;color:${col}">${rel >= 78 ? '推广位中' : rel <= 22 ? '有下架风险' : `关系 ${rel}`}</span></div>
              <div class="tiny dim" style="margin:4px 0 6px">${c.desc}</div>
              <div class="bar" style="height:8px"><div style="width:${rel}%;height:100%;background:${col}"></div></div>
              <div class="row" style="gap:6px;margin-top:8px">
                <button class="btn small" data-act="channel-invest" data-id="${c.id}" ${state.company.cash < cost ? 'disabled' : ''}>关系投入（${fmtMoney(cost)}）</button>
              </div>
            </div>`;
          }).join('')}
        </div>
        <div class="tiny dim" style="margin-top:6px">关系 &lt;22 有下架/曝光下滑风险，&gt;78 渠道会安排推广位（品牌 +）。投入费用随关系升高而变贵。</div>
      </div>
      ${state.hype && state.hype.months > 0 ? `<div class="card" style="margin-bottom:12px;border-color:rgba(74,163,255,.4)">
        <div class="between"><b>新品热度期</b><span class="chip accent">全市场需求 +${Math.round((state.hype.mul - 1) * 100)}%</span></div>
        <div class="tiny dim" style="margin-top:5px">发布会带来的媒体关注还会持续 ${state.hype.months} 个月。</div>
      </div>` : ''}
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">消费者人群 <span class="right">全球加权 · 7 类人群</span></div>
        <div class="seg-grid">
          ${segRows.map(({ seg, ours, w }) => `
            <div class="seg-card">
              <div class="row" style="gap:7px;align-items:center">
                <span class="seg-ico" style="background:${seg.color}22;color:${seg.color}">${seg.icon}</span>
                <b>${seg.name}</b>
                <span class="chip" style="margin-left:auto">${Math.round((w / wSum) * 100)}%</span>
              </div>
              <div class="tiny dim seg-desc">${seg.desc}</div>
              <div class="bar"><i style="width:${clamp(ours * 100 * 4, 1, 100)}%;background:${seg.color}"></i></div>
              <div class="between tiny" style="margin-top:5px">
                <span class="dim">我方份额</span><b class="${ours > 0.01 ? 'good' : ''}">${(ours * 100).toFixed(2)}%</b>
              </div>
              <div class="tiny dim" style="margin-top:4px">最在意 ${Object.entries(seg.prefs).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => ({ perf: '性能', cam: '影像', bat: '续航', design: '设计', brand: '品牌', price: '价格' }[k])).join(' / ')}</div>
            </div>`).join('')}
        </div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-title">全球市场概览 <span class="right tiny dim">在目标市场建分公司可本地化生产：关税减免 90%、需求 +3%</span></div>
        <table class="tbl">
          <thead><tr><th>市场</th><th class="num">月需求规模</th><th class="num">我方份额</th><th class="num">本月销量</th><th class="num">消费力</th><th>偏好</th><th>本地生产</th></tr></thead>
          <tbody>
            ${MARKETS.map((m) => {
              const info = marketShare(state, m.id);
              const bm = lastReport?.byMarket?.find((x) => x.id === m.id);
              const prefs = Object.entries(m.prefs).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => ({ perf: '性能', cam: '影像', bat: '续航', design: '设计', brand: '品牌', price: '价格' }[k])).join(' / ');
              const os = overseasOf(state, m.id);
              const invest = overseasInvest(m.id);
              const canBuild = m.id !== state.company.country && !os;
              const eff = effectiveTariff(state, m);
              return `<tr>
                <td><b>${m.name}</b><div class="tiny dim">人口 ${m.pop}M · 关税 ${(m.tariff * 100).toFixed(0)}%${eff < (m.tariff || 0) ? ` <span class="good">→ ${(eff * 100).toFixed(1)}%</span>` : ''}</div></td>
                <td class="num">${fmtUnit(m.base * eraFactor(state.date.year))}</td>
                <td class="num ${info.ownShare > 0.01 ? 'good' : ''}">${(info.ownShare * 100).toFixed(2)}%</td>
                <td class="num">${fmtNum(bm?.units || 0)}</td>
                <td class="num">${(m.wealth * 100).toFixed(0)}</td>
                <td class="tiny muted">${prefs}</td>
                <td class="num">${os
                  ? `<span class="good tiny">🏭 本地工厂</span><div class="tiny dim">维护 ¥${fmtNum(overseasUpkeepSingle(m.id))}/月 <a style="cursor:pointer;color:var(--warn)" data-act="sell-overseas" data-m="${m.id}">出售</a></div>`
                  : canBuild
                    ? `<button class="btn small" data-act="build-overseas" data-m="${m.id}" title="投资 ${fmtMoney(invest)} 建立本地工厂">建厂 ¥${fmtNum(invest)}</button>`
                    : '<span class="tiny dim">—</span>'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      ${models.length ? `<div class="card">
        <div class="card-title">定价与渠道 <span class="right">价格按当地货币等值人民币计</span></div>
        <table class="tbl">
          <thead><tr><th>机型</th><th>市场</th><th class="num">建议价</th><th class="num">我的定价</th><th class="num">毛利率</th><th></th></tr></thead>
          <tbody>
            ${models.flatMap((m) => {
              const variants = (m.design?.variants || []).filter((v) => v && v.ram && v.stg);
              const gb = (g) => g >= 1 ? `${Math.round(g * 10) / 10}G` : `${Math.round(g * 1024)}M`;
              const vLabel = (v) => {
                const r = RAMS.find((x) => x.id === v.ram), st = STORAGES.find((x) => x.id === v.stg);
                return `${gb(r?.gb || 0)}+${gb(st?.gb || 0)}`;
              };
              return MARKETS.map((mk) => {
                const on = m.markets.includes(mk.id);
                // 基础款价格缺失（老档/新进市场）时用建议价兜底并写回，避免显示 0 与 0% 毛利
                if (on && !(m.price[mk.id] > 0)) m.price[mk.id] = suggestedPrice(state, m, mk.id);
                const p = m.price[mk.id] || 0;
                const cost = unitCost(state, m);
                const margin = p > 0 ? (p - cost) / p : 0;
                const rows = [];
                rows.push(`<tr>
                  <td>${mk === MARKETS[0] ? `<b>${esc(m.name)}</b>` : ''}</td>
                  <td>${mk.name}${variants.length ? ' <span class="tiny dim">（基础款）</span>' : ''}</td>
                  <td class="num">¥${fmtNum(suggestedPrice(state, m, mk.id))}</td>
                  <td class="num" style="width:130px">
                    ${on ? `<input type="number" value="${Math.round(p)}" step="50" data-field="price" data-model="${m.id}" data-market="${mk.id}" />` : '<span class="dim tiny">未进入</span>'}
                  </td>
                  <td class="num ${margin > 0.15 ? 'good' : margin > 0 ? 'warn' : 'bad'}">${on ? (margin * 100).toFixed(0) + '%' : '—'}</td>
                  <td class="num">
                    <button class="btn small ${on ? 'ghost' : ''}" data-act="toggle-market" data-model="${m.id}" data-market="${mk.id}">${on ? '退出' : '进入 ¥80万'}</button>
                    ${on ? `<button class="btn small ghost" data-act="auto-price" data-model="${m.id}" data-market="${mk.id}">建议价</button>` : ''}
                  </td>
                </tr>`);
                // 每个配置版本单独一行定价（价格存 v.price[market]，缺省跟随机型基准价）
                variants.forEach((v, vi) => {
                  const vp = (v.price && (v.price[mk.id] ?? v.price.cn)) || p;
                  const vCost = cost + (v.ram === m.design.parts.ram && v.stg === m.design.parts.storage ? 0 : 0);
                  const vMargin = vp > 0 ? (vp - vCost) / vp : 0;
                  rows.push(`<tr class="vrow">
                    <td></td>
                    <td class="tiny dim">└ ${vLabel(v)}</td>
                    <td class="num tiny dim">¥${fmtNum(Math.round(suggestedPrice(state, m, mk.id)))}</td>
                    <td class="num" style="width:130px">
                      ${on ? `<input type="number" value="${Math.round(vp)}" step="50" data-field="vprice" data-model="${m.id}" data-market="${mk.id}" data-vi="${vi}" />` : '<span class="dim tiny">—</span>'}
                    </td>
                    <td class="num ${vMargin > 0.15 ? 'good' : vMargin > 0 ? 'warn' : 'bad'}">${on ? (vMargin * 100).toFixed(0) + '%' : '—'}</td>
                    <td class="num">${on ? `<button class="btn tiny ghost" data-act="v-auto-price" data-model="${m.id}" data-market="${mk.id}" data-vi="${vi}">建议价</button>` : ''}</td>
                  </tr>`);
                });
                return rows.join('');
              });
            }).join('')}
          </tbody>
        </table>
      </div>` : `<div class="card"><div class="empty">还没有在售机型，先去设计并量产一款手机。<br/><button class="btn small primary" data-act="goto" data-tab="product">去设计</button></div></div>`}`;
  }

  // ---------- 自研部门（独立页）：部门卡片 + 自研 OS 生态 + 系统科技树 ----------
  function pageSelfRnd() {
    const os = state.osPop || { pop: 0, version: 0, versionName: '1.0', licensed: false, licIncome: 0 };
    const osdLv = state.divisions?.osd?.level || 0;
    const hasOs = osdLv > 0;
    const hasOsDesign = !!(state.divisions?.osd?.latest && state.divisions.osd.latest.ok)
      || (state.divisions?.osd?.products || []).some((p2) => p2.status === 'completed');
    const ot = state.osTech || { unlocked: [], proj: null };
    const tb = osTechBonuses(state);
    const osCard = `<div class="card" style="margin-bottom:12px" id="os-pop-card">
        <div class="card-title">自研 OS 生态 <span class="right">流行度由装机量驱动 · 版本迭代抬升上限 · 可授权收费</span></div>
        <div class="row" style="gap:14px;align-items:center;flex-wrap:wrap">
          <div><div class="tiny dim">流行度</div><b class="mono" style="font-size:20px;color:#8fd0ff">${os.pop.toFixed(1)}</b></div>
          <div><div class="tiny dim">当前版本</div><b class="mono">${hasOs ? esc(String(os.versionName)) : '—'}</b></div>
          <div><div class="tiny dim">授权状态</div><b>${os.licensed ? '<span class="chip good">开放授权</span>' : '<span class="chip">未开放</span>'}</b></div>
          ${os.licensed ? `<div><div class="tiny dim">上月授权收入</div><b class="mono">+${fmtMoney(os.licIncome || 0)}</b></div>` : ''}
          <div><div class="tiny dim">上月商店分成</div><b class="mono">+${fmtMoney(os.storeRevenue || 0)}</b></div>
          <div style="margin-left:auto" class="row">
            ${!hasOs ? '<span class="tiny dim">成立系统开发部后可用</span>'
              : !hasOsDesign ? '<span class="tiny dim">尚无自研系统：先在下方部门卡「＋ 设计新产品」完成一款自研系统</span>'
              : `<button class="btn small primary" data-act="os-release" ${state.company.cash < osReleaseCost(state) ? 'disabled' : ''}>发布新版本（${fmtMoney(osReleaseCost(state))}）</button>
              <button class="btn small ${os.licensed ? 'ghost' : ''}" data-act="os-license">${os.licensed ? '停止授权' : '开放授权'}</button>`}
          </div>
        </div>
        <div class="bar" style="height:8px;margin-top:8px"><div style="width:${Math.min(100, os.pop)}%;height:100%;background:linear-gradient(90deg,#4aa3ff,#8fd0ff)"></div></div>
        <div class="section-label">授权厂商（${(os.licensees || []).length}/5）</div>
        <div class="row" style="gap:5px;flex-wrap:wrap">
          ${(os.licensees || []).map((l) => `<span class="chip good">${esc(l.name)} · ${Math.round((l.rate || 0) * 100)}%</span>`).join('') || '<span class="tiny dim">开放授权后每月自动签约（需流行度 ≥ 8）</span>'}
        </div>
        <div class="tiny dim" style="margin-top:5px">流行度 ≥ 8 才有厂商愿意签约授权；授权收入 = 基础授权费 + 逐厂商合约；自研 OS 机型的销量同时带来应用商店 15% 分成。</div>
      </div>`;
    const techCard = `<div class="card" style="margin-bottom:12px">
        <div class="card-title">系统科技树 <span class="right">系统开发部专属技术路线 · 软件部人力驱动研发</span></div>
        <div class="tiny dim" style="margin-bottom:8px">当前加成：评分 +${tb.scoreBonus} · 生态 +${tb.appsBonus} · 流行度上限 +${tb.popCap} · 流行度增速 +${tb.popGrowth}% · 授权收入 +${tb.licRate}%</div>
        ${ot.proj ? `<div class="tiny" style="color:#8fd0ff;margin-bottom:6px">🔧 「${esc(OS_TECHS.find((t) => t.id === ot.proj.id)?.name || '')}」研发中 — 预计还需 ${Math.max(1, Math.ceil(ot.proj.monthsLeft))} 个月</div>` : ''}
        <div class="tiny" style="margin:8px 0 4px"><b>系统路线</b> <span class="tiny dim">按世代迭代 · 前代为前置 · 加成永久叠加</span></div>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin-bottom:10px">
          ${OS_ROUTES.map((r) => {
            const routes = Array.isArray(ot.routes) ? ot.routes : (ot.route ? [ot.route] : []);
            const done = routes.includes(r.id);
            const prevOk = !r.prev || routes.includes(r.prev);
            const okYear = r.year <= state.date.year;
            const okLv = (state.divisions?.osd?.level || 0) >= r.osdLv;
            const canGo = !done && prevOk && okYear && okLv;
            return `<div class="tech-node ${done ? 'done' : canGo ? 'ready' : prevOk ? 'future' : 'locked'}" ${canGo ? `data-act="os-route" data-id="${r.id}" title="${esc(r.desc)}"` : `title="${esc(r.desc)}"`}>
              <div class="tname">${r.name}${done ? ' ✓' : ''}</div>
              <div class="tmeta"><span>${r.year} 年 · 系统部 Lv.${r.osdLv}</span><span>${done ? '已迭代' : canGo ? `迭代 ${fmtMoney(r.cost)}` : !prevOk ? '需先迭代上一代' : `${r.year} 年 / Lv.${r.osdLv}`}</span></div>
            </div>`;
          }).join('')}
        </div>
        ${OS_TECH_BRANCHES.map((br) => `
          <div class="tech-cat">
            <h3><span style="width:8px;height:8px;border-radius:2px;background:${br.color};display:inline-block"></span>${br.name}</h3>
            <div class="tech-grid">
              ${OS_TECHS.filter((t) => t.branch === br.id).map((t) => {
                const st = osTechState(t, state.date.year, ot.unlocked, ot.proj);
                const label = { done: '已掌握', doing: '研发中', future: `${t.year} 年`, locked: '需前置', ready: `研发 ${fmtMoney(t.cost)}` }[st];
                return `<div class="tech-node ${st}" ${st === 'ready' ? `data-act="os-tech-start" data-id="${t.id}" title="${esc(t.desc)}（${t.months} 个月）"` : `title="${esc(t.desc)}"`}>
                  <div class="tname">${t.name}</div>
                  <div class="tmeta"><span>${t.year}</span><span>${label}</span></div>
                  ${st === 'doing' ? `<div class="prog" style="width:${Math.round((1 - ot.proj.monthsLeft / ot.proj.monthsTotal) * 100)}%"></div>` : ''}
                </div>`;
              }).join('')}
            </div>
          </div>`).join('')}
      </div>`;
    return `
      ${head('自研部门', '成立部门后可设计多款产品并行研发，等级限制品质上限；系统开发部产出自研 OS')}
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">自研部门 <span class="right">自研部件供自家机型使用，也可对外供货赚取收入</span></div>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px">
          ${DIVISION_IDS.map((id) => {
            const def = DIVISION_DEFS[id];
            const div = state.divisions?.[id] || { level: 0, supplyOn: false };
            const lv = div.level;
            const spec = id === 'chip' ? ownCpuSpec(state) : id === 'optics' ? ownCmrSpec(state)
              : id === 'osd' ? ownOsSpec(state) : ownPanelSpec(state);
            const specText = id === 'chip' && spec ? `自研 SoC ${spec.gen}.0 · 性能 ${Math.round(spec.perf)}` : '';
            const specText2 = id === 'optics' && spec ? `影像模组评分 ${Math.round(spec.score)} · ${spec.sensor} ${spec.aperture}` : '';
            const specText3 = id === 'osd' && spec ? `自研系统等级 ${spec.level} · 评分加成 +${spec.scoreBonus}` : '';
            const specText4 = id === 'panel' && spec ? `面板品质 ${Math.round(spec.quality)}（自产成本 -28%）` : '';
            return `<div class="org-exec filled" style="border-color:${def.color}44">
              <div class="between"><b><span style="color:${def.color}">${def.icon}</span> ${def.name}</b>
                ${lv > 0 ? `<span class="chip good">Lv.${lv}${div.supplyOn ? ' · 供货中' : ''}</span>` : '<span class="chip">未成立</span>'}</div>
              <div class="tiny dim" style="margin:4px 0 6px">${def.desc}</div>
              ${div.proj ? `<div class="tiny" style="color:${def.color};margin-bottom:4px">🔧 研发升级 Lv.${div.proj.target} 中 — 进度 ${Math.round(div.proj.progress / div.proj.work * 100)}%（研发部人力越强越快）</div>
              <div class="bar" style="height:6px;margin-bottom:8px"><div style="width:${Math.round(div.proj.progress / div.proj.work * 100)}%;height:100%;background:${def.color}"></div></div>`
                : ''}
              ${lv > 0 && !div.proj ? `<div class="tiny" style="color:${def.color};margin-bottom:6px">${specText || specText2 || specText3 || specText4}
                ${lv < 5 ? ` · 下级升级费用 ${fmtMoney(upgradeCost(id, lv))}` : ' · 已满级'}</div>
              <div class="row" style="gap:6px">
                ${lv < 5 ? `<button class="btn small" data-act="div-upgrade" data-id="${id}">部门升级 Lv.${lv + 1}（${fmtMoney(upgradeCost(id, lv))}）</button>` : ''}
                <button class="btn small primary" data-act="div-design" data-id="${id}">＋ 设计新产品</button>
                <button class="btn small ${div.supplyOn ? 'primary' : 'ghost'}" data-act="div-supply" data-id="${id}">${div.supplyOn ? '停止对外供货' : '开始对外供货'}</button>
                <span class="tiny dim" style="margin-left:auto">月维护 ${fmtMoney(def.upkeep * lv)}${div.supplyOn ? ` · 供货收入约 ${fmtMoney(def.supplyRate * lv * eraFactor(state.date.year))}/月` : ''}</span>
              </div>
              ${(div.products || []).length ? `<div class="tiny dim" style="margin-top:4px">产品池（${(div.products || []).filter((p2) => p2.status === 'completed').length} 款可用）：</div>
              ${(div.products || []).map((p2) => `<div class="between tiny" style="padding:2px 0"><span>${p2.status === 'designing' ? `⏳ ${p2.name}（剩 ${Math.ceil(p2.monthsLeft)} 月）` : `✓ ${p2.name} · ${p2.specs?.perf ? `性能 ${p2.specs.perf}` : p2.specs?.score ? `评分 ${Math.round(p2.specs.score)}` : p2.specs?.quality ? `品质 ${Math.round(p2.specs.quality)}` : ''}`}</span></div>`).join('')}` : ''}`
              : !div.proj ? `<div class="row" style="gap:6px">
                <button class="btn small primary" data-act="div-build" data-id="${id}">成立（${fmtMoney(def.buildCost)}）</button>
                <span class="tiny dim">${def.unlockText}</span>
              </div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>
      ${osCard}
      ${techCard}`;
  }

  function pageCompany() {
    const depts = DEPT_DEFS;
    if (!state.hiringPool) state.hiringPool = genPool(state);
    const ts = trainingSummary(state);
    const dist = rankDistribution(state);
    const tree = orgTree(state);
    const stage = stageOf(state);
    return `
      ${head('组织与员工', `${state.employees.length} 名员工 · 月薪 ${fmtMoney(sum(state.employees, (e) => e.salary))}`,
        `<button class="btn small" data-act="refresh-pool">刷新招聘市场</button>`)}
      <div class="org-stage">
        <b>${stage.name}</b>
        <span class="chip">${stage.min === 0 ? `0–${stage.max} 人` : stage.max === Infinity ? `${stage.min}+ 人` : `${stage.min}–${stage.max} 人`}</span>
        <span class="tiny dim">${stage.desc}</span>
        <span class="chip ${tree.depts.filter((d) => d.head).length >= 5 ? 'good' : 'warn'}" style="margin-left:auto">已任命主管 ${tree.depts.filter((d) => d.head).length} / ${tree.depts.length}</span>
      </div>
      <div class="kpi-row">
        <div class="kpi"><div class="k">在岗人数</div><div class="v">${state.employees.length}</div><div class="d dim">工位 ${officeCapacity(state)}</div></div>
        <div class="kpi"><div class="k">培训中</div><div class="v">${ts.count}</div><div class="d dim">月支出 ${fmtMoney(ts.monthly)}</div></div>
        <div class="kpi"><div class="k">高级及以上</div><div class="v">${dist[3] + dist[4] + dist[5]}</div><div class="d dim">专家 ${dist[5]} · 资深 ${dist[4]}</div></div>
        <div class="kpi"><div class="k">平均能力</div><div class="v">${(sum(state.employees, (e) => e.skill) / Math.max(1, state.employees.length)).toFixed(1)}</div><div class="d dim">平均满意度 ${Math.round(sum(state.employees, (e) => e.satisfaction) / Math.max(1, state.employees.length))}</div></div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="card-title">组织架构 <span class="right">主管带来部门加成，空缺则效率打折</span></div>
        <div class="org-ceo">
          <div style="width:34px;height:34px;border-radius:50%;background:#4aa3ff22;color:#4aa3ff;display:flex;align-items:center;justify-content:center;font-weight:700">CEO</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:650">${tree.ceo ? esc(tree.ceo.name) : '<span class="bad">席位空缺</span>'}</div>
            <div class="tiny dim">${tree.ceo ? `能力 ${Math.round(tree.ceo.skill)} · 沟通 ${tree.ceo.comm} · 加成 +${Math.round(leaderBonus(tree.ceo) * 100)}%` : '没有 CEO 时所有部门效率下降'}</div>
          </div>
          <button class="btn small ghost" data-act="open-exec" data-seat="ceo">调整</button>
        </div>
        <div class="org-line"></div>
        <div class="org-execs">
          ${tree.execs.filter((s) => s.id !== 'ceo').map((s) => `
            <div class="org-exec ${s.emp ? 'filled' : ''}">
              <div class="between"><b>${s.name}</b>${s.emp ? `<span class="chip good">+${Math.round(leaderBonus(s.emp) * 100)}%</span>` : '<span class="chip">空缺</span>'}</div>
              <div class="tiny dim" style="margin:4px 0 6px">${s.emp ? esc(s.emp.name) : s.desc}</div>
              <button class="btn small ghost" data-act="open-exec" data-seat="${s.id}">${s.emp ? '更换' : '任命'}</button>
            </div>`).join('')}
        </div>
        <div class="org-line"></div>
        <div class="org-depts">
          ${tree.depts.map((d) => `
            <div class="org-dept">
              <div class="between">
                <span><span style="color:${d.color}">${d.icon}</span> <b>${d.name}</b></span>
                <span class="chip">${d.count} 人</span>
              </div>
              <div class="tiny dim" style="margin-top:4px">平均能力 ${d.avgSkill.toFixed(1)}</div>
              <div class="head-row">
                ${d.head
                  ? `<span class="rank-badge" style="background:#37c9a522;color:#37c9a5;border-color:#37c9a566">主管</span>
                     <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.head.name)}</span>
                     <button class="btn small ghost danger" data-act="clear-head" data-dept="${d.id}">卸任</button>`
                  : `<span class="dim" style="flex:1">主管空缺</span>
                     <button class="btn small ghost" data-act="open-head" data-dept="${d.id}">任命</button>`}
              </div>
            </div>`).join('')}
        </div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="between">
          <div class="card-title" style="margin:0">职级结构</div>
          <span class="tiny dim">职级由能力决定，能力达到 56 / 68 / 80 / 90 自动晋级，薪资期望同步上调</span>
        </div>
        <div class="rank-row">
          ${RANKS.map((r) => `
            <div class="rank-cell">
              <div class="row" style="gap:7px"><span class="rank-badge" style="background:${r.color}22;color:${r.color};border-color:${r.color}66">${r.name}</span>
              <b class="mono">${dist[r.lv]}</b></div>
              <div class="bar" style="margin-top:7px"><i style="width:${(dist[r.lv] / Math.max(1, state.employees.length)) * 100}%;background:${r.color}"></i></div>
              <div class="tiny dim" style="margin-top:4px">能力 ≥ ${r.min} · 薪资系数 ×${r.pay}</div>
            </div>`).join('')}
        </div>
        <div class="row wrap" style="gap:8px;margin-top:12px">
          ${TRAININGS.map((t) => `
            <div class="train-card">
              <div class="row" style="gap:7px"><b>${t.icon} ${t.name}</b><span class="chip">${t.months} 个月</span></div>
              <div class="tiny dim" style="margin:5px 0 6px">${t.desc}</div>
              <div class="tiny"><span class="dim">月费</span> <b>${fmtMoney(trainingCost(state, t))}</b> <span class="dim">/ 人</span></div>
            </div>`).join('')}
        </div>
      </div>

      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(210px,1fr));margin-bottom:12px">
        ${depts.map((d) => {
          const n = state.employees.filter((e) => e.deptId === d.id).length;
          const p = staffPower(state, d.id);
          return `<div class="card" style="padding:12px">
            <div class="between"><div class="row" style="gap:6px"><span style="color:${d.color}">${d.icon}</span><b>${d.name}</b></div><span class="chip">${n} 人</span></div>
            <div class="tiny dim" style="margin:6px 0 8px;min-height:32px">${d.desc}</div>
            <div class="between tiny"><span class="dim">综合能力</span><b class="mono">${p.toFixed(1)}</b></div>
            <div class="bar" style="margin-top:4px"><i style="width:${clamp(p * 12, 2, 100)}%;background:${d.color}"></i></div>
            <div class="between tiny" style="margin-top:8px"><span class="dim">工作重点</span><span class="mono">${d.focus ?? 50}</span></div>
            <input type="range" min="0" max="100" value="${d.focus ?? 50}" data-field="dept-focus" data-id="${d.id}" data-live="f_${d.id}" />
            <div class="between tiny dim" style="margin-top:4px"><span>成本优先</span><span>质量优先</span></div>
          </div>`;
        }).join('')}
      </div>

      <div class="two-col">
        <div class="card">
          <div class="card-title">员工名册 <span class="right">${state.employees.length} 人</span></div>
      <div class="row" style="gap:5px;margin:8px 0;flex-wrap:wrap">
        <span class="tiny dim">按部门：</span>
        <button class="btn tiny ${empFilter === 'all' ? 'primary' : ''}" data-act="emp-filter" data-v="all">全部</button>
        ${DEPT_DEFS.map((d2) => `<button class="btn tiny ${empFilter === d2.id ? 'primary' : ''}" data-act="emp-filter" data-v="${d2.id}">${d2.name}</button>`).join('')}
      </div>          <div style="max-height:520px;overflow:auto">
            <table class="tbl">
              <thead><tr><th>姓名</th><th>部门</th><th>岗位</th><th class="num">能力</th><th class="num">满意</th><th class="num">月薪</th><th></th></tr></thead>
              <tbody>
                ${[...state.employees].filter((e) => empFilter === 'all' || e.deptId === empFilter).sort((a, b) => b.skill - a.skill).map((e) => {
                  const rk = rankOf(e.skill);
                  return `
                  <tr>
                    <td>${e.star ? '<span title="行业明星：产出 +12%，品牌 +，注意被挖角">⭐</span> ' : ''}<b>${esc(e.name)}</b><div class="tiny dim">${e.age}岁 · ${e.edu} · ${e.field}</div></td>
                    <td>
                      <select data-field="emp-dept" data-id="${e.id}" style="padding:3px 4px;font-size:11.5px">
                        <option value="">待分配</option>
                        ${DEPT_DEFS.map((d) => `<option value="${d.id}" ${e.deptId === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
                      </select>
                    </td>
                    <td class="tiny">
                      <span class="rank-badge" style="background:${rk.color}22;color:${rk.color};border-color:${rk.color}66">${rk.name}</span>
                      ${e.role}
                      ${e.training ? `<div class="tiny accent">培训中 · ${TRAINING_MAP[e.training.id]?.name || ''}（剩 ${e.training.monthsLeft} 月）</div>`
                        : traitNames(e).length ? `<div class="dim">${traitNames(e).join('·')}</div>` : ''}
                    </td>
                    <td class="num">${Math.round(e.skill)}</td>
                    <td class="num ${e.satisfaction > 60 ? 'good' : e.satisfaction > 40 ? 'warn' : 'bad'}" title="月流失风险 ${(e.leaveRisk || 0).toFixed(1)}%">${Math.round(e.satisfaction)}<div class="tiny dim">风险 ${(e.leaveRisk || 0).toFixed(1)}%</div></td>
                    <td class="num">¥${fmtNum(e.salary)}</td>
                    <td class="num" style="white-space:nowrap">
                      <button class="btn small ghost" data-act="open-emp" data-id="${e.id}">详情</button>
                      <button class="btn small ghost" data-act="raise" data-id="${e.id}">加薪</button>
                      ${e.training
                        ? `<button class="btn small ghost danger" data-act="cancel-train" data-id="${e.id}">停训</button>`
                        : `<button class="btn small ghost" data-act="open-train" data-id="${e.id}">培训</button>`}
                      <button class="btn small ghost danger" data-act="fire" data-id="${e.id}"
                        title="解雇需支付 2 个月薪资作为补偿">解雇</button>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-title">招聘市场 <span class="right">入职费 = 2 个月薪资</span></div>
          <div class="row" style="gap:5px;margin-bottom:8px;flex-wrap:wrap">
            <button class="btn small ${(state.recruitChannel || 'social') === 'social' ? 'primary' : ''}" data-act="recruit-channel" data-v="social">社招</button>
            <button class="btn small ${state.recruitChannel === 'campus' ? 'primary' : ''}" data-act="recruit-channel" data-v="campus">校招</button>
            <button class="btn small ${state.recruitChannel === 'headhunter' ? 'primary' : ''}" data-act="recruit-channel" data-v="headhunter">猎头</button>
            <div style="flex:1"></div>
            ${(state.recruitChannel || 'social') === 'campus' ? `<button class="btn tiny" data-act="campus-event" ${(state.recruitment?.campusEventMonths || 0) > 0 ? 'disabled' : ''}>${(state.recruitment?.campusEventMonths || 0) > 0 ? `招聘会中（${state.recruitment.campusEventMonths}月）` : '举办招聘会（¥300万）'}</button>` : ''}
            ${(state.recruitChannel || 'social') === 'headhunter' ? '<span class="tiny dim" style="align-self:center">猎头费 = 年薪 20%</span>' : ''}
            ${(state.recruitChannel || 'social') === 'campus' ? '<span class="tiny dim" style="align-self:center">应届生：薪资低潜力高，3-4/9-10 月最佳</span>' : ''}
          </div>
          <div class="list">
            ${state.hiringPool.map((c, i) => {
              const rk = rankOf(c.skill);
              return `
              <div class="list-item">
                <div style="flex:1">
                  <div class="between"><b>${esc(c.name)}</b><span class="tiny dim">${c.age}岁 · ${c.edu}</span></div>
                  <div class="tiny dim">${c.field} · 能力 ${Math.round(c.skill)} · <span style="color:${rk.color}">${rk.name}</span> · 期望 ¥${fmtNum(c.salary)}/月</div>
                </div>
                <button class="btn small primary" data-act="hire" data-i="${i}" data-dept="${c.deptId || ''}">录用</button>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>`;
  }


  function pageFinance() {
    const r = lastReport;
    const hist = historyRows(state, 24);
    const debt = state.company.debt;
    const activePol = activePolicies(state);
    return `
      ${head('财务中心', `现金 ${fmtMoney(state.company.cash)} · 负债 ${fmtMoney(debt)}`,
        `<button class="btn small" data-act="loan" data-amount="10000000">贷款 1000 万</button>
         <button class="btn small ghost" data-act="repay" data-amount="10000000">还款 1000 万</button>`)}
      ${activePol.length ? `
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">宏观政策 <span class="right tiny dim">${activePol.length} 项生效中</span></div>
      <div class="card" style="padding:10px;margin-bottom:12px"><div class="card-title">收支图表（近 24 月）</div><div id="fin-svg"></div></div>
        <div class="cap-grid">
          ${activePol.map((p) => `
          <div class="cap-card">
            <div class="row" style="gap:7px;align-items:center">
              <span style="font-size:16px">${p.policy.icon}</span>
              <b>${p.policy.name}</b>
              <span class="chip ${p.policy.kind === 'good' ? 'good' : p.policy.kind === 'bad' ? 'bad' : ''}" style="margin-left:auto">${p.monthsLeft} 个月</span>
            </div>
            <div class="tiny dim" style="margin:6px 0">${p.policy.desc}</div>
            <div class="tiny">${POLICY_EFFECT_TEXT(p.policy.effects)}</div>
          </div>`).join('')}
        </div>
      </div>` : ''}
      <div class="two-col">
        <div class="card">
          <div class="card-title">上月损益表 <span class="right">${r ? `${r.date.year}年${r.date.month + 1}月` : '尚无结算'}</span></div>
          ${r ? `<div class="report-grid">
            <div class="line"><span>营业收入</span><b class="mono">${fmtMoney(r.revenue)}</b></div>
            <div class="line"><span>营业成本（BOM+加工）</span><b class="mono">-${fmtMoney(r.cogs)}</b></div>
            <div class="line"><span>渠道与分成</span><b class="mono">-${fmtMoney(r.channel || 0)}</b></div>
            <div class="line"><span>工资</span><b class="mono">-${fmtMoney(r.salaries)}</b></div>
            <div class="line"><span>租金与办公</span><b class="mono">-${fmtMoney(r.rent)}</b></div>
            <div class="line"><span>市场营销</span><b class="mono">-${fmtMoney(r.marketing)}</b></div>
            <div class="line"><span>研发投入</span><b class="mono">-${fmtMoney(r.rnd)}</b></div>
            <div class="line"><span>员工培训</span><b class="mono">-${fmtMoney(r.training || 0)}</b></div>
            <div class="line"><span>售后与物流</span><b class="mono">-${fmtMoney(r.warranty || 0)}</b></div>
            <div class="line"><span>退货支出</span><b class="mono">-${fmtMoney(r.refunds || 0)}</b></div>
            <div class="line"><span>利息</span><b class="mono">-${fmtMoney(r.interest)}</b></div>
            <div class="line"><span>所得税</span><b class="mono">-${fmtMoney(r.tax)}</b></div>
            <div class="line total"><span>净利润</span><b class="mono ${r.net >= 0 ? 'good' : 'bad'}">${fmtMoney(r.net)}</b></div>
          </div>
          <div class="tiny dim" style="margin-top:12px">本月销量 ${fmtUnit(r.units)} · 平均售价 ¥${fmtNum(r.units ? r.revenue / r.units : 0)}${r.spotCost ? ` · 缺料急采溢价 ${fmtMoney(r.spotCost)}` : ''}</div>` :
          '<div class="empty">推进一个月后显示损益</div>'}
        </div>

        <div class="grid" style="gap:12px">
          <div class="card">
            <div class="card-title">媒体渠道投放 <span class="right">月合计 ${fmtMoney(channelTotal(state))}</span></div>
            ${channelSummary(state).map((ch) => `
              <div style="margin-bottom:9px">
                <div class="between" style="margin-bottom:3px">
                  <span>${ch.icon} ${ch.name} ${ch.locked ? `<span class="chip">${ch.from} 年解锁</span>` : ''}<span class="tiny dim" style="margin-left:6px">${ch.desc}</span></span>
                  <b class="mono" data-out="ch_${ch.id}">${fmtMoney(ch.budget)}</b>
                </div>
                ${ch.locked ? '' : `<div class="row" style="gap:5px;align-items:center">
                  <button class="btn tiny" data-act="ch-set" data-id="${ch.id}" data-v="-">−</button>
                  <input type="range" min="0" max="5000000" step="50000" value="${ch.budget}" data-field="ch-budget" data-id="${ch.id}" data-live="ch_${ch.id}" style="flex:1" />
                  <button class="btn tiny" data-act="ch-set" data-id="${ch.id}" data-v="+">+</button>
                  <span class="tiny ${ch.fit > 1.05 ? 'good' : ch.fit < 0.85 ? 'bad' : 'dim'}" style="width:76px;text-align:right">定位契合 ${ch.fit > 1.05 ? '+' : ''}${((ch.fit - 1) * 100).toFixed(0)}%</span>
                </div>`}
              </div>`).join('')}
            <div class="tiny dim" style="margin-top:6px">渠道受众与在售产品线定位匹配时效果加成；与产品线完全错位时效果打折。</div>
            <div class="section-label">保修政策</div>
            <div class="row wrap" style="gap:6px">
              ${WARRANTY_POLICIES.map((p) => `<button class="btn small ${(state.company.warrantyPolicy || 'w1y') === p.id ? 'primary' : ''}" data-act="warranty" data-id="${p.id}" title="${p.desc}">${p.name}</button>`).join('')}
            </div>
            <div class="tiny dim" style="margin-top:5px">当前：${warrantyOf(state).name} — 售后成本 ×${warrantyOf(state).costMul.toFixed(2)}，退货率 -${Math.round(warrantyOf(state).returnsCut * 100)}%，评分 +${warrantyOf(state).ratingAdd}。</div>
            <div class="section-label">融资</div>
            <div class="tiny" style="line-height:1.9">
              <div class="between"><span class="dim">授信额度</span><b>${fmtMoney(Math.max(0, state.company.brand * 3e6 + state.company.valuation * 0.3 - debt))}</b></div>
              <div class="between"><span class="dim">年化利率</span><b>7.5%</b></div>
              <div class="between"><span class="dim">资产负债率</span><b>${((debt / Math.max(1, state.company.valuation)) * 100).toFixed(1)}%</b></div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">现金流趋势</div>
            <div class="chart-wrap" style="height:130px"><canvas id="fin-chart"></canvas></div>
          </div>
        </div>
      </div>
      ${capitalCard()}`;
  }

  function drawFinChartSVG() {
    const el2 = document.getElementById('fin-svg');
    if (!el2) return;
    const hist = historyRows(state, 24);
    if (!hist.length) { el2.innerHTML = '<div class="tiny dim" style="padding:20px">推进时间后显示图表</div>'; return; }
    const w = el2.clientWidth || 600, h = 220;
    const padL = 50, padR = 16, padT = 16, padB = 36;
    const iw = w - padL - padR, ih = h - padT - padB;
    const maxV = Math.max(...hist.map(h2 => Math.abs(h2.revenue || 0)), 1);
    const barW = Math.max(4, iw / hist.length * 0.35);
    let bars = '', labels = '', grid = '';
    for (let g = 0; g <= 4; g++) {
      const gy = padT + ih - (g / 4) * ih;
      const val = Math.round(maxV * g / 4);
      grid += `<line x1="${padL}" y1="${gy}" x2="${w - padR}" y2="${gy}" stroke="rgba(128,128,128,.12)" width="1"/>`;
      labels += `<text x="${padL - 6}" y="${gy + 4}" text-anchor="end" font-size="10" fill="rgba(128,128,128,.5)">${val >= 1e8 ? (val / 1e8).toFixed(1) + '亿' : val >= 1e4 ? Math.round(val / 1e4) + '万' : val}</text>`;
    }
    hist.forEach((h2, i) => {
      const cx = padL + (i + 0.5) * (iw / hist.length);
      const revH = Math.abs(h2.revenue || 0) / maxV * ih;
      const netH = Math.abs(h2.net || 0) / maxV * ih;
      bars += `<rect x="${cx - barW - 1}" y="${padT + ih - revH}" width="${barW}" height="${Math.max(1, revH)}" fill="rgba(74,163,255,.75)" rx="1"><title>收入</title></rect>`;
      bars += `<rect x="${cx + 1}" y="${padT + ih - netH}" width="${barW}" height="${Math.max(1, netH)}" fill="rgba(55,201,165,.75)" rx="1"><title>净利</title></rect>`;
      if (i % 3 === 0) labels += `<text x="${cx}" y="${h - 6}" text-anchor="middle" font-size="9" fill="rgba(128,128,128,.5)">${h2.y}/${h2.m + 1}</text>`;
    });
    el2.innerHTML = '<svg width="100%" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' + grid + labels + bars +
      '<text x="' + padL + '" y="12" font-size="11" fill="#4aa3ff">■ 收入</text>' +
      '<text x="' + (padL + 60) + '" y="12" font-size="11" fill="#37c9a5">■ 净利</text></svg>';
  }
  setTimeout(drawFinChartSVG, 60);

  function capitalCard() {
    const cap = ensureCapital(state);
    const val = valuationOf(state);
    const limit = raiseLimit(state);
    const founder = founderPct(state);
    const ipoReqs = ipoRequirements(state);
    const listed = !!cap.ipo?.listed;
    const targets = [...state.competitors]
      .filter((c) => !c.sub)
      .sort((a, b) => acquisitionCost(a) - acquisitionCost(b))
      .slice(0, 4);
    return `<div class="card" style="margin-top:12px">
      <div class="card-title">资本运作 <span class="right">估值 ${fmtMoney(val)}${listed ? ` · 市值 ${fmtMoney(marketCap(state))}` : ''}</span></div>
      <div class="cap-grid">
        <div class="cap-card">
          <div class="between"><b>股权结构</b><span class="chip">${cap.rounds.length} 轮融资</span></div>
          <div style="margin-top:8px">
            ${cap.holders.map((h) => `<div class="holder-row">
              <span style="width:76px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.name}</span>
              <div class="bar"><i style="width:${h.pct}%;background:${h.name === '创始团队' ? '#4aa3ff' : h.name === '公众股东' ? '#37c9a5' : '#c47cf0'}"></i></div>
              <b class="mono" style="width:48px;text-align:right">${h.pct.toFixed(1)}%</b>
            </div>`).join('')}
          </div>
          <div class="tiny dim" style="margin-top:9px">融资会稀释股份；创始团队低于 35% 时投资人不再接受新轮次。</div>
        </div>

        <div class="cap-card">
          <div class="between"><b>股权融资</b><span class="chip">本轮上限 ${fmtMoney(limit)}</span></div>
          <div class="tiny dim" style="margin:7px 0 9px">按投前估值 ${fmtMoney(val)} 定价，融 ${fmtMoney(limit)} 约稀释 ${((limit / (val + limit)) * 100).toFixed(1)}% 股份。</div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            ${[0.35, 0.6, 1].map((f) => {
              const amt = Math.round(limit * f / 1e4) * 1e4;
              return `<button class="btn small ${f === 0.6 ? 'primary' : ''}" data-act="raise-capital" data-amount="${amt}"
                ${founder <= 35 || amt <= 0 ? 'disabled' : ''}>融 ${fmtMoney(amt)}</button>`;
            }).join('')}
          </div>
          ${founder <= 35 ? '<div class="tiny bad" style="margin-top:8px">创始团队持股已低于 35%，无法继续融资。</div>' : ''}
        </div>

        <div class="cap-card">
          <div class="between"><b>IPO 上市</b><span class="chip ${listed ? 'good' : canIPO(state) ? 'warn' : ''}">${listed ? '已上市' : canIPO(state) ? '可以申报' : '条件未满足'}</span></div>
          ${listed
            ? `<div class="tiny" style="line-height:2;margin-top:6px">
                 <div class="between"><span class="dim">股价</span><b class="mono">¥${cap.stock.price.toFixed(2)}</b></div>
                 <div class="between"><span class="dim">总市值</span><b class="mono">${fmtMoney(marketCap(state))}</b></div>
                 <div class="between"><span class="dim">募资</span><b>${fmtMoney(cap.ipo.raised)}</b></div>
               </div>`
            : `<div class="tiny" style="line-height:1.95;margin-top:6px">
                 ${ipoReqs.map((x) => `<div class="between"><span class="${x.ok ? 'good' : 'dim'}">${x.ok ? '✓' : '·'} ${x.key}</span><b class="tiny">${x.now} <span class="dim">/ ${x.need}</span></b></div>`).join('')}
               </div>
               <button class="btn small primary" style="margin-top:9px;width:100%" data-act="ipo" ${canIPO(state) ? '' : 'disabled'}>
                 ${canIPO(state) ? '申报上市（发行 20%）' : '尚不满足上市条件'}
               </button>`}
        </div>

        <div class="cap-card">
          <div class="between"><b>收购竞争对手</b><span class="chip">${targets.length} 个目标</span></div>
          <div class="tiny dim" style="margin:7px 0 8px">通过谈判收购：对方会多轮还价，出价太低会激怒对方终止谈判。品牌越强防御越高；可选现金/分期/换股支付，也可直接溢价 35% 发起敌意收购。</div>
          ${targets.length ? targets.map((c) => `
            <div class="between" style="margin-top:6px;gap:8px">
              <span class="tiny">${c.name} <span class="dim">品牌 ${c.brand.toFixed(0)} · 防御 ${Math.round(compDefense(c) * 100)}% · 在售 ${(c.lineup || []).length} 款</span></span>
              <span class="row" style="gap:4px">
                <button class="btn small ghost" data-act="acquire" data-comp="${c.id}">谈判</button>
                <button class="btn small ghost danger" data-act="acquire" data-comp="${c.id}" data-hostile="1" title="溢价 35%、不还价，品牌 ≥ 55 且现金充足">敌意</button>
              </span>
            </div>`).join('') : '<div class="tiny dim">暂时没有可收购标的。</div>'}
          <div class="section-label">成立子品牌</div>
          <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:6px">
            <input id="sub-name" placeholder="子品牌中文名" style="flex:1;min-width:110px" />
            <input id="sub-name-en" placeholder="英文名" style="flex:1;min-width:90px" />
            <select id="sub-pos" style="width:auto">
              ${SUB_POSITIONS.map((p) => `<option value="${p.id}">${p.name}（${fmtMoney(p.cost)}）</option>`).join('')}
            </select>
          </div>
          <button class="btn small primary" data-act="found-sub">成立子品牌</button>
          <div class="tiny dim" style="margin-top:5px">${SUB_POSITIONS.map((p) => `${p.name}：${p.desc}`).join(' · ')}</div>
        </div>
      </div>

      ${(state.subsidiaries || []).length ? `<div class="card" style="margin-top:12px">
        <div class="card-title">子公司 / 子品牌 <span class="right">${state.subsidiaries.length} 家 · 利润按比例上缴母公司</span></div>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">
          ${state.subsidiaries.map((sub) => `
            <div class="org-exec filled" style="border-color:${sub.color}55">
              <div class="between"><b><span style="color:${sub.color}">▣</span> ${esc(sub.name)}</b>
                <span class="chip">${sub.source === 'acquired' ? '收购' : '自创'}</span></div>
              <div class="tiny dim" style="margin:4px 0">${sub.nameEn || ''} · 品牌力 ${sub.brand.toFixed(0)} · 在售 ${(sub.lineup || []).length} 款</div>
              <div class="between tiny"><span class="dim">上月利润上缴</span><b class="mono good">+${fmtMoney(sub.lastProfit || 0)}</b></div>
              ${sub.integration ? `<div class="tiny" style="margin-top:4px"><span class="chip warn">整合期 剩 ${sub.integration.months}/${sub.integration.total} 月 · 利润最高 -${Math.round((sub.integration.penalty || 0) * 100)}%</span></div>` : ''}
              ${sub.payment ? `<div class="between tiny"><span class="dim">分期收购款（剩 ${sub.payment.monthsLeft} 期）</span><b class="mono warn">-${fmtMoney(sub.payment.perMonth)}/月</b></div>` : ''}
              <div class="tiny dim" style="margin-top:2px">支付方式：${sub.payMode === 'installment' ? '分期' : sub.payMode === 'equity' ? '换股' : '现金'}${sub.techShare > 0 ? ` · 技术共享 +${Math.round(sub.techShare * 100)}%` : ''}</div>
              ${(sub.lineup || []).length ? `<div class="section-label">产品线</div>${sub.lineup.map((p) => `<div class="between tiny"><span>${esc(p.name)}</span><b class="mono">¥${fmtNum(p.price)}</b></div>`).join('')}` : ''}
              ${state.subTechOffer && state.subTechOffer.subId === sub.id ? `<div class="tiny" style="margin-top:6px;padding:6px 8px;background:rgba(74,163,255,.08);border-radius:6px">
                <b>技术转让要约</b>：「${esc(state.subTechOffer.techName)}」· ${fmtMoney(state.subTechOffer.price)}（剩 ${state.subTechOffer.months} 月）
                <div class="row" style="gap:6px;margin-top:4px"><button class="btn tiny primary" data-act="sub-tech-yes">接受</button><button class="btn tiny ghost" data-act="sub-tech-no">婉拒</button></div>
              </div>` : ''}
              ${state.subEmployeeOffer && state.subEmployeeOffer.subId === sub.id ? `<div class="tiny" style="margin-top:6px;padding:6px 8px;background:rgba(55,201,165,.08);border-radius:6px">
                <b>员工推荐</b>：${esc(state.subEmployeeOffer.emp.name)}（${state.subEmployeeOffer.emp.role} · 能力 ${state.subEmployeeOffer.emp.skill}）免入职费入职（剩 ${state.subEmployeeOffer.months} 月）
                <div class="row" style="gap:6px;margin-top:4px"><button class="btn tiny primary" data-act="sub-emp-yes">接受</button><button class="btn tiny ghost" data-act="sub-emp-no">婉拒</button></div>
              </div>` : ''}
              <div class="row" style="gap:6px;margin-top:7px">
                <button class="btn small primary" data-act="sub-release" data-id="${sub.id}">发布新品（${fmtMoney(Math.round(6e5 * (1 + (sub.techShare || 0) * 2.5))) }）</button>
                <button class="btn small ghost" data-act="sell-sub" data-id="${sub.id}">出售（约 ${(0.5 + Math.pow(Math.max(sub.brand, 8), 1.6) * 1e-5).toFixed(1)} 亿）</button>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}
    </div>`;
  }

  // 竞品销量序列：compHistory 快照 + 我方 history 拼接
  function compSeries(months = 12) {
    const hist = compHistoryRows(state, months);
    const me = { id: 'me', name: state.company.name, color: state.company.logoColor };
    const names = [me, ...state.competitors.map((c) => ({ id: c.id, name: c.name, color: c.color }))];
    const series = names.map((n) => ({
      ...n,
      data: hist.map((h) => {
        if (n.id === 'me') {
          const p = state.history.find((x) => x.y === h.y && x.m === h.m);
          return p ? p.units : 0;
        }
        const r = (h.rows || []).find((x) => x.id === n.id);
        return r ? r.units : 0;
      }),
    }));
    return { labels: hist.map((h) => `${h.m + 1}月`), series };
  }

  function rankTable(dim) {
    const n = dim === 'month' ? 1 : dim === 'quarter' ? 3 : 12;
    const hist = compHistoryRows(state, n);
    const myRows = historyRows(state, Math.max(12, n));
    const me = { id: 'me', name: state.company.name, color: state.company.logoColor };
    const rows = [me, ...state.competitors.map((c) => ({ id: c.id, name: c.name, color: c.color }))].map((r) => {
      let units = 0, cash = 0, brand = 0;
      if (r.id === 'me') {
        units = myRows.slice(-n).reduce((s, h) => s + (h.units || 0), 0);
        cash = state.company.cash - state.company.debt;
        brand = state.company.brand;
      } else {
        units = hist.reduce((s, h) => s + ((h.rows || []).find((x) => x.id === r.id)?.units || 0), 0);
        cash = state.competitors.find((c) => c.id === r.id)?.cash || 0;
        brand = state.competitors.find((c) => c.id === r.id)?.brand || 0;
      }
      return { ...r, units, cash, brand };
    });
    if (dim === 'asset') rows.sort((a, b) => b.cash - a.cash);
    else rows.sort((a, b) => b.units - a.units);
    const dimName = dim === 'month' ? '月度销量' : dim === 'quarter' ? '季度销量（近 3 个月）' : dim === 'year' ? '年度销量（近 12 个月）' : '公司资产（净现金）';
    const max = Math.max(...rows.map((r) => (dim === 'asset' ? r.cash : r.units)), 1);
    return `
      <div class="row" style="gap:6px;margin-bottom:10px">
        ${['month', 'quarter', 'year', 'asset'].map((d) =>
          `<button class="btn small ${rivalRank === d ? 'primary' : ''}" data-act="rival-rank" data-v="${d}">${{ month: '月度销量', quarter: '季度销量', year: '年度销量', asset: '公司资产' }[d]}</button>`).join('')}
      </div>
      <div class="tiny dim" style="margin-bottom:8px">${dimName} · 按数值排序</div>
      ${rows.map((r, i) => `
        <div class="between" style="padding:6px 4px;border-bottom:1px solid var(--border)">
          <div class="row" style="gap:8px;flex:1">
            <span class="mono dim" style="width:18px">${i + 1}</span>
            <div style="width:16px;height:16px;border-radius:4px;background:${r.color};flex-shrink:0"></div>
            <span class="tiny"><b>${r.name}</b>${r.id === 'me' ? ' <span class="dim">(我方)</span>' : ''}</span>
          </div>
          <div style="width:40%">
            <div style="height:8px;border-radius:4px;background:var(--border)"><div style="height:100%;border-radius:4px;background:${r.color};width:${Math.max(2, (dim === 'asset' ? r.cash : r.units) / max * 100)}%"></div></div>
          </div>
          <b class="mono tiny" style="width:90px;text-align:right">${dim === 'asset' ? fmtMoney(r.cash) : fmtUnit(r.units)}</b>
        </div>`).join('')}`;
  }

  function rivalChartSvg(kind) {
    const { labels, series } = compSeries(12);
    const W = 680, H = 250, padL = 46, padB = 26, padT = 12;
    const iw = W - padL - 8, ih = H - padB - padT;
    const maxV = Math.max(1, ...series.flatMap((s) => s.data));
    const nM = Math.max(1, labels.length);
    if (kind === 'line') {
      const paths = series.map((s) => s.data.map((v, i) => {
        const x = padL + (nM === 1 ? iw / 2 : (i / (nM - 1)) * iw);
        const y = padT + ih - (v / maxV) * ih;
        return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(''));
      const dots = series.map((s) => s.data.map((v, i) => {
        const x = padL + (nM === 1 ? iw / 2 : (i / (nM - 1)) * iw);
        const y = padT + ih - (v / maxV) * ih;
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" fill="${s.color}"/>`;
      }).join(''));
      return `<svg viewBox="0 0 ${W} ${H}" style="width:100%">
        ${[0.25, 0.5, 0.75, 1].map((g) => `<line x1="${padL}" y1="${padT + ih - g * ih}" x2="${W - 8}" y2="${padT + ih - g * ih}" stroke="#232e3d" stroke-width="1"/>`).join('')}
        ${paths.map((p, i) => `<path d="${p}" fill="none" stroke="${series[i].color}" stroke-width="2.2" opacity="${series[i].id === 'me' ? 1 : 0.75}"/>`).join('')}
        ${dots}
        ${labels.map((l, i) => `<text x="${padL + (nM === 1 ? iw / 2 : (i / (nM - 1)) * iw)}" y="${H - 8}" fill="#7d8ba0" font-size="10" text-anchor="middle">${l}</text>`).join('')}
        <text x="${padL - 6}" y="${padT + 10}" fill="#7d8ba0" font-size="10" text-anchor="end">${fmtUnit(maxV)}</text>
      </svg>`;
    }
    // 分组柱状图
    const gw = iw / nM;
    const bw = Math.max(2, Math.min(14, (gw - 6) / series.length));
    const bars = series.map((s, si) => s.data.map((v, i) => {
      const x = padL + i * gw + 3 + si * bw;
      const h = (v / maxV) * ih;
      return `<rect x="${x.toFixed(1)}" y="${(padT + ih - h).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" fill="${s.color}" rx="1.5" opacity="${s.id === 'me' ? 1 : 0.8}"/>`;
    }).join('')).join('');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%">
      ${[0.25, 0.5, 0.75, 1].map((g) => `<line x1="${padL}" y1="${padT + ih - g * ih}" x2="${W - 8}" y2="${padT + ih - g * ih}" stroke="#232e3d" stroke-width="1"/>`).join('')}
      ${bars}
      ${labels.map((l, i) => `<text x="${padL + i * gw + gw / 2}" y="${H - 8}" fill="#7d8ba0" font-size="10" text-anchor="middle">${l}</text>`).join('')}
      <text x="${padL - 6}" y="${padT + 10}" fill="#7d8ba0" font-size="10" text-anchor="end">${fmtUnit(maxV)}</text>
    </svg>`;
  }

  function pageRivals() {
    const share = avgShare(state);
    const legend = compSeries(12).series.map((s) =>
      `<span class="row tiny" style="gap:4px"><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${s.color}"></i>${s.id === 'me' ? '我方' : s.name}</span>`).join('');
    return `
      ${head('竞争对手', '每家厂商都会自主研发、发布新机与调整价格')}
      <div class="kpi-row">
        <div class="kpi"><div class="k">我方全球份额</div><div class="v">${(share * 100).toFixed(2)}%</div></div>
        <div class="kpi"><div class="k">最强品牌</div><div class="v">${Math.max(state.company.brand, ...state.competitors.map((c) => c.brand)).toFixed(0)}</div></div>
        <div class="kpi"><div class="k">在售竞品数</div><div class="v">${sum(state.competitors, (c) => c.lineup.length)}</div></div>
        <div class="kpi"><div class="k">行业均价</div><div class="v">¥${fmtNum(sum(state.competitors.flatMap((c) => c.lineup), (p) => p.price) / Math.max(1, sum(state.competitors, (c) => c.lineup.length)))}</div></div>
      </div>
      <div class="grid" style="gap:12px;margin-bottom:12px">
        <div class="card">
          <div class="between" style="margin-bottom:6px">
            <div class="card-title" style="margin:0">全行业月销量 · 近 12 个月</div>
            <div class="row" style="gap:6px">
              <button class="btn small ${rivalChart === 'bar' ? 'primary' : ''}" data-act="rival-chart" data-v="bar">柱状图</button>
              <button class="btn small ${rivalChart === 'line' ? 'primary' : ''}" data-act="rival-chart" data-v="line">折线图</button>
            </div>
          </div>
          ${rivalChartSvg(rivalChart)}
          <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:6px">${legend}</div>
        </div>
        <div class="card">
          <div class="card-title">行业排名</div>
          ${rankTable(rivalRank)}
        </div>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(340px,1fr))">
        ${[...state.competitors].sort((a, b) => (b.lastSold || 0) - (a.lastSold || 0)).map((c) => {
          const line = c.lineup.slice(-2);
          const ally = (state.rivalAlliances || []).find((a) => a.a === c.id || a.b === c.id);
          const sig = signatureOf(c);
          return `<div class="card">
            <div class="between" style="margin-bottom:8px">
              <div class="row" style="gap:8px">
                <div style="width:26px;height:26px;border-radius:7px;background:${c.color};display:grid;place-items:center;font-size:12px;font-weight:700;color:#fff">${c.name[0]}</div>
                <div><b>${c.name}</b><span class="tiny dim"> ${c.nameEn || ''}</span><div class="tiny dim">${c.country} · ${c.style === 'value' ? '性价比' : c.style === 'ecosystem' ? '生态高端' : c.style === 'camera' ? '影像' : c.style === 'tech' ? '技术驱动' : c.style === 'supply' ? '供应链' : c.style === 'rugged' ? '耐用功能' : c.style === 'business' ? '商务安全' : c.style === 'design' ? '设计' : '品质'} · 上月销量 ${fmtUnit(c.lastSold || 0)}</div></div>
              </div>
              <div class="tiny" style="text-align:right"><div class="dim">品牌力</div><b class="mono">${c.brand.toFixed(0)}</b>
                <div style="margin-top:4px"><button class="btn tiny ghost" data-act="comp-detail" data-id="${c.id}">财报</button></div></div>
            </div>
            ${ally ? `<div class="tiny" style="margin-bottom:6px"><span class="chip good">联盟 ${esc(ally.name)}</span></div>` : ''}
            ${sig ? `<div class="tiny" style="margin-bottom:6px"><span class="chip" title="${esc(sig.desc)}">${sig.icon} ${esc(sig.name)}</span></div>` : ''}
            <div class="tiny dim" style="margin-bottom:8px">${c.desc}</div>
            <div class="tiny dim" style="margin-bottom:6px">产能 ${fmtUnit(c.capacity || 0)}/月 · 库存 ${fmtUnit(Math.round(c.inventory || 0))}${(c.inventory || 0) < (c.capacity || 0) * 0.15 ? ' <span class="warn">· 缺货</span>' : ''}</div>
            ${line.map((p) => `<div class="list-item" style="padding:7px 9px;margin-bottom:5px">
              <div style="flex:1">
                <div class="tiny"><b>${p.name}</b> <span class="dim">· ${p.age} 月前发布</span></div>
                <div class="tiny dim">性能 ${Math.round(p.scores.perf)} · 影像 ${Math.round(p.scores.camera)} · 续航 ${Math.round(p.scores.battery)} · 设计 ${Math.round(p.scores.design)}</div>
              </div>
              <b class="mono tiny">¥${fmtNum(p.price)}</b>
            </div>`).join('') || '<div class="tiny dim">暂无在售机型</div>'}
          </div>`;
        }).join('')}
      </div>`;
  }

  // 竞品财报：现金 / 品牌 / 产能库存 / 产品线 / 近 12 月销量与结盟情况
  function openCompDetail(compId) {
    const c = state.competitors.find((x) => x.id === compId);
    if (!c) { opts.onToast?.('该公司已不在市场中', 'warn'); return; }
    const sig = signatureOf(c);
    const rows = compHistoryRows(state, 12).map((h) => {
      const r = (h.rows || []).find((x) => x.id === c.id) || {};
      return { y: h.y, m: h.m, units: r.units || 0, rev: r.rev || 0 };
    });
    const maxU = Math.max(1, ...rows.map((r) => r.units));
    const allies = (state.rivalAlliances || [])
      .filter((a) => a.a === c.id || a.b === c.id)
      .map((a) => (state.competitors.find((x) => x.id === (a.a === c.id ? a.b : a.a)) || {}).name || '未知');
    const body = `<div class="kpi-row" style="margin-bottom:12px">
        <div class="kpi"><div class="k">现金</div><div class="v">${fmtMoney(c.cash || 0)}</div><div class="d dim">月营收 ${fmtMoney(c.revenueEst || 0)}</div></div>
        <div class="kpi"><div class="k">品牌力</div><div class="v">${(c.brand || 0).toFixed(0)}</div><div class="d dim">份额 ${((c.share || 0) * 100).toFixed(1)}%</div></div>
        <div class="kpi"><div class="k">产能</div><div class="v">${fmtUnit(c.capacity || 0)}</div><div class="d dim">库存 ${fmtUnit(Math.round(c.inventory || 0))}</div></div>
        <div class="kpi"><div class="k">在售机型</div><div class="v">${(c.lineup || []).length}</div><div class="d dim">上月 ${fmtUnit(c.lastSold || 0)} 台</div></div>
      </div>
      <div class="two-col">
        <div class="card">
          <div class="card-title">近 12 月销量 <span class="right">估算值</span></div>
          <div style="max-height:300px;overflow:auto">
            ${rows.map((r) => `<div style="margin-bottom:6px">
              <div class="between tiny"><span class="dim mono">${r.y}/${r.m + 1}</span><span><b>${fmtUnit(r.units)}</b> 台 · <span class="dim">${fmtMoney(r.rev)}</span></span></div>
              <div class="bar" style="height:4px"><i style="width:${Math.max(2, Math.round(r.units / maxU * 100))}%;background:#4aa3ff"></i></div>
            </div>`).join('') || '<div class="empty">尚无历史快照</div>'}
          </div>
        </div>
        <div class="card">
          <div class="card-title">产品线</div>
          ${(c.lineup || []).map((p) => `<div class="list-item" style="padding:7px 9px">
            <div style="flex:1">
              <div class="tiny"><b>${esc(p.name)}</b> <span class="dim">· ${p.age} 月</span></div>
              <div class="tiny dim">性能 ${Math.round(p.scores?.perf || 0)} · 影像 ${Math.round(p.scores?.camera || 0)} · 续航 ${Math.round(p.scores?.battery || 0)} · 设计 ${Math.round(p.scores?.design || 0)}</div>
            </div>
            <b class="mono tiny">¥${fmtNum(p.price)}</b>
          </div>`).join('') || '<div class="empty">无在售机型</div>'}
          <div class="section-label">招牌能力</div>
          <div class="tiny" style="line-height:1.8">${sig ? `<b>${sig.icon} ${esc(sig.name)}</b><div class="dim">${esc(sig.desc)}</div>` : '<span class="dim">无</span>'}</div>
          <div class="section-label">战略联盟</div>
          <div class="tiny">${allies.length ? allies.map((n) => `<span class="chip good" style="margin:2px">${esc(n)}</span>`).join('') : '<span class="dim">暂无盟友</span>'}</div>
          <div class="tiny dim" style="margin-top:8px">联盟成员在份额计算中获得 6% 曝光加成，联盟到期后自动解除。</div>
          <div class="section-label">猎头行动</div>
          <button class="btn small primary" data-act="poach" data-comp="${c.id}">挖角核心工程师（约 3 个月薪资）</button>
          <div class="tiny dim" style="margin-top:5px">成功率随对方品牌下降、随我方品牌上升；失败仍支付猎头费。</div>
        </div>
      </div>`;
    modalShell(`${c.name} · 财报与产品线`, `${c.nameEn || ''} · ${c.country || ''} · ${c.style}`, body, 'modal-wide');
  }

  function pageHQ() {
    const o = state.offices[0];
    const util = plotUtilization(state);
    const works = constructionProgress(state);
    // 没有对应楼宇时加成是 0，显示「—」比「+0%」「-0.0 pt」更像人话
    const nz = (v, txt) => (v > 0 ? txt : '—');
    const cap = campusBonus(state, 'capacity');
    const rnd = campusBonus(state, 'rndSpeed');
    const dsn = campusBonus(state, 'designScore');
    const chn = campusBonus(state, 'channelCut');
    const war = campusBonus(state, 'warrantyCut');
    const brd = campusBonus(state, 'brand');
    const bonuses = [
      ['月产能', nz(cap, fmtUnit(cap))],
      ['研发加速', nz(rnd, `+${Math.round(rnd * 100)}%`)],
      ['设计评分', nz(dsn, `+${dsn.toFixed(1)}`)],
      ['渠道成本', nz(chn, `-${(chn * 100).toFixed(1)} 个百分点`)],
      ['售后成本', nz(war, `-${Math.round(war * 100)}%`)],
      ['品牌加成', nz(brd, `+${brd.toFixed(1)}/月`)],
    ];
    return `
      ${head('公司园区', `${util.owned} 块地块 · ${util.used} 栋建筑 · 工位 ${officeCapacity(state)}`,
        `<button class="btn small" data-act="open-layout">3D 布局编辑</button>
         <button class="btn small" data-act="open-floorplan">平面规划</button>
         <button class="btn small" data-act="open-screendesign">屏幕设计</button>
         <button class="btn small" data-act="expand-office">租用临时工位（${fmtMoney(2000000 * o.level)}）</button>`)}
      <div class="two-col" style="grid-template-columns:1.25fr 1fr">
        <div class="card" style="padding:8px">
          <div class="scene-3d" id="office-scene"></div>
          <div class="tiny dim" style="padding:8px 6px 2px">拖动旋转视角 · 右键/Ctrl+拖动平移 · 滚轮缩放。45° 视角下自动隐藏面朝你的墙体与天花板，切「俯视」看整体布局。</div>
        </div>
        <div class="grid" style="gap:12px">
          <div class="card">
            <div class="card-title">园区加成</div>
            <div class="tiny" style="line-height:2">
              ${bonuses.map(([k, v]) => `<div class="between"><span class="dim">${k}</span><b class="mono">${v}</b></div>`).join('')}
            </div>
          </div>
          <div class="card">
            <div class="card-title">部门分布</div>
            ${DEPT_DEFS.map((d) => {
              const n = state.employees.filter((e) => e.deptId === d.id).length;
              return `<div class="between tiny" style="margin-bottom:6px">
                <span><span style="color:${d.color}">${d.icon}</span> ${d.name}</span>
                <span class="mono">${n} 人</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      ${works.length ? `<div class="card" style="margin-top:12px">
        <div class="card-title">施工中 <span class="right">${works.length} 个项目</span></div>
        ${works.map(({ plot, building, def }) => {
          const done = building.monthsTotal - building.monthsLeft;
          return `<div class="list-item" style="margin-bottom:6px">
            <div style="flex:1">
              <div class="between"><b>${def.icon} ${def.name}${building.targetLevel > 1 ? ` Lv.${building.targetLevel}` : ''}</b>
                <span class="tiny dim">${plot.name} · 还需 ${building.monthsLeft} 个月</span></div>
              <div class="bar" style="margin-top:6px"><i style="width:${(done / Math.max(1, building.monthsTotal)) * 100}%"></i></div>
            </div>
          </div>`;
        }).join('')}
      </div>` : ''}

      <div class="card" style="margin-top:12px">
        <div class="card-title">地块与楼宇 <span class="right">已开发 ${util.used} / ${util.owned} 块</span></div>
        <div class="plot-grid">
          ${state.campus.plots.map((p) => {
            const b = p.building;
            const def = b ? BUILDING_MAP[b.typeId] : null;
            const building = b && b.status === 'building';
            const active = b && b.status === 'active';
            return `<div class="plot ${p.owned ? 'owned' : 'locked'} ${b ? 'built' : ''}">
              <div class="between">
                <b>${p.name}</b>
                <span class="tiny dim">${p.area} 亩</span>
              </div>
              ${def ? `
                <div class="plot-ico" style="color:${active ? 'var(--accent)' : 'var(--warn)'}">${def.icon}</div>
                <div class="tiny"><b>${def.name}</b>${active ? ` Lv.${b.level}` : ` · 施工中 ${b.monthsLeft} 月`}</div>
                <div class="tiny dim" style="min-height:30px">${def.desc}</div>
                <div class="row wrap" style="gap:6px;margin-top:6px">
                  ${active && b.level < def.maxLevel
                    ? `<button class="btn small" data-act="upgrade-building" data-plot="${p.id}">升级 ${fmtMoney(buildingCost(b.typeId, b.level))}</button>`
                    : active ? '<span class="chip good">已满级</span>' : '<span class="chip warn">施工中</span>'}
                </div>
              ` : p.owned ? `
                <div class="plot-ico dim">＋</div>
                <div class="tiny dim" style="min-height:30px">空地，可建造研发、生产或物流设施。</div>
                <button class="btn small primary" data-act="open-build" data-plot="${p.id}">建造</button>
              ` : `
                <div class="plot-ico dim">🔒</div>
                <div class="tiny dim" style="min-height:30px">尚未购入，购买后可开发。</div>
                <button class="btn small" data-act="buy-plot" data-plot="${p.id}">购地 ${fmtMoney(p.price)}</button>
              `}
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }


  // ---------- 3D / 图表挂载 ----------
  function mountOffice() {
    const el = content.querySelector('#office-scene');
    if (!el) return;
    try {
      scene = createOfficeScene(el, state);
      el.__office = scene; // 测试/自动化句柄
      scene.setOnChanged(() => paintTopbar());
      scene.setOnToast((m, k) => opts.onToast?.(m, k));
    } catch (e) {
      el.innerHTML = `<div class="empty">3D 场景初始化失败：${esc(e.message)}</div>`;
    }
  }

  function showReport() {
    if (!lastReport) { opts.onToast?.('推进一个月后才有报表', 'warn'); return; }
    const r = lastReport;
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `<div class="modal">
      <h2>${r.date.year}年${r.date.month + 1}月 经营报表</h2>
      <div class="modal-sub">${esc(state.company.name)} · 员工 ${state.employees.length} 人</div>
      <div class="report-grid">
        <div class="line"><span>销量</span><b>${fmtUnit(r.units)}</b></div>
        <div class="line"><span>营收</span><b>${fmtMoney(r.revenue)}</b></div>
        <div class="line"><span>营业成本</span><b>-${fmtMoney(r.cogs)}</b></div>
        <div class="line"><span>渠道</span><b>-${fmtMoney(r.channel || 0)}</b></div>
        <div class="line"><span>工资</span><b>-${fmtMoney(r.salaries)}</b></div>
        <div class="line"><span>营销</span><b>-${fmtMoney(r.marketing)}</b></div>
        <div class="line"><span>研发</span><b>-${fmtMoney(r.rnd)}</b></div>
        <div class="line"><span>培训</span><b>-${fmtMoney(r.training || 0)}</b></div>
        <div class="line"><span>售后与退货</span><b>-${fmtMoney((r.warranty || 0) + (r.refunds || 0))}</b></div>
        <div class="line"><span>税费与利息</span><b>-${fmtMoney(r.tax + r.interest)}</b></div>
        <div class="line total"><span>净利润</span><b class="${r.net >= 0 ? 'good' : 'bad'}">${fmtMoney(r.net)}</b></div>
      </div>
      ${r.returns ? `<div class="tiny dim" style="margin-top:10px">退货率 ${r.returns}%${r.avgUserScore ? ` · 用户评分 ${r.avgUserScore}` : ''}</div>` : ''}
      ${r.notes?.length ? `<div class="section-label">本月提示</div>${r.notes.slice(0, 6).map((n) => `<div class="tiny muted" style="margin-bottom:3px">· ${esc(n)}</div>`).join('')}` : ''}
      <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" data-act="close-modal">关闭</button></div>
    </div>`;
    document.body.appendChild(mask);
    mask.querySelector('[data-act="close-modal"]').onclick = () => mask.remove();
    mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
  }

  function modalShell(title, sub, body, width = '') {
    if (activeModal) { activeModal.close(); activeModal = null; }
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `<div class="modal ${width}">
      <div class="between"><h2 style="margin:0">${title}</h2><button class="btn small ghost" data-close>关闭</button></div>
      <div class="modal-sub">${sub}</div>
      ${body}
    </div>`;
    document.body.appendChild(mask);
    const close = () => mask.remove();
    mask.querySelector('[data-close]').onclick = close;
    // 弹窗内的 data-act 需要单独路由（弹窗挂在 body 上，不在 content 的监听范围内）
    mask.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      act(el.dataset.act, el.dataset);
    });
    mask.onclick = (e) => { if (e.target === mask) close(); };
    activeModal = { mask, close };
    return { mask, close };
  }

  function closeModal() {
    if (activeModal) { activeModal.close(); activeModal = null; }
  }

  function openLineupPicker(modelId) {
    const target = modelId ? state.models.find((m) => m.id === modelId) : null;
    const body = `<div class="build-grid">${LINEUPS.map((l) => `
      <div class="build-card">
        <div class="between"><b>${l.icon} ${l.name}</b><span class="chip">定价 ×${l.priceTier.toFixed(2)}</span></div>
        <div class="tiny dim" style="margin:6px 0 8px;min-height:34px">${l.desc}</div>
        <div class="tiny" style="margin-bottom:8px">
          ${Object.entries(l.appeal).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) =>
            `<div class="between"><span class="dim">${(SEGMENT_MAP[k] || {}).name || k}</span><b class="${v >= 1 ? 'good' : 'bad'}">${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%</b></div>`).join('')}
        </div>
        <button class="btn small primary" data-act="${target ? 'set-lineup' : 'create-model'}" ${target ? `data-id="${target.id}"` : ''} data-lineup="${l.id}">${target ? '改归此系列' : '用此系列开新机'}</button>
      </div>`).join('')}</div>`;
    modalShell(target ? `调整产品线 · ${esc(target.name)}` : '选择产品线',
      '产品线决定定价定位、目标人群与品牌加成；改归系列会清空现有定价', body, 'modal-wide');
  }

  function openBuildModal(plotId) {
    const plot = state.campus.plots.find((p) => p.id === plotId);
    if (!plot) return;
    const body = `<div class="build-grid">
      ${BUILDINGS.map((b) => {
        const cost = buildingCost(b.id, 0);
        const ok = canBuild(state, plotId, b.id).ok;
        return `<div class="build-card ${ok ? '' : 'disabled'}">
          <div class="between"><b>${b.icon} ${b.name}</b><span class="chip">${b.months} 个月</span></div>
          <div class="tiny dim" style="margin:6px 0 8px;min-height:34px">${b.desc}</div>
          <div class="tiny" style="line-height:1.8">
            ${Object.entries(b.effects).filter(([k]) => k !== 'officeCap' && k !== 'hire').map(([k, v]) => {
              const label = BUILD_EFFECT_LABEL[k] || k;
              const txt = (BUILD_EFFECT_FMT[k] || ((x) => `+${x}`))(v);
              return `<div class="between"><span class="dim">${label}</span><b>${txt}</b></div>`;
            }).join('')}
            <div class="between"><span class="dim">工位</span><b>+${b.effects.officeCap || 0}/级</b></div>
          </div>
          <button class="btn small primary" style="margin-top:9px;width:100%" data-act="build" data-plot="${plotId}" data-type="${b.id}" ${ok ? '' : 'disabled'}>
            ${ok ? `建造 ${fmtMoney(cost)}` : state.company.cash < cost ? '资金不足' : '不可建造'}
          </button>
        </div>`;
      }).join('')}
    </div>`;
    modalShell('选择楼宇', `${plot.name} · 面积 ${plot.area} 亩 · 现金 ${fmtMoney(state.company.cash)}`, body, 'modal-wide');
  }

  function openHeadModal(deptId) {
    const dept = DEPT_DEFS.find((d) => d.id === deptId);
    if (!dept) return;
    const list = candidatesFor(state, deptId);
    if (!list.length) {
      modalShell(`任命 ${dept.name} 主管`, '需要先往这个部门招人', '<div class="empty">该部门还没有员工。</div>');
      return;
    }
    const body = `<table class="tbl">
      <thead><tr><th>姓名</th><th class="num">能力</th><th class="num">沟通</th><th class="num">满意度</th><th class="num">预期加成</th><th></th></tr></thead>
      <tbody>${list.map((e) => {
        const b = leaderBonus(e);
        const rk = rankOf(e.skill);
        return `<tr>
          <td><b>${esc(e.name)}</b><div class="tiny dim">${rk.name} · ${e.role} · ${e.age} 岁</div></td>
          <td class="num">${Math.round(e.skill)}</td>
          <td class="num">${e.comm}</td>
          <td class="num">${Math.round(e.satisfaction)}</td>
          <td class="num ${b > 0.05 ? 'good' : b < 0 ? 'bad' : ''}">${b >= 0 ? '+' : ''}${Math.round(b * 100)}%</td>
          <td class="num"><button class="btn small primary" data-act="appoint-head" data-dept="${deptId}" data-id="${e.id}">任命</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
    modalShell(`任命 ${dept.name} 主管`, '主管加成由能力（60%）与沟通（40%）决定，55 分为及格线', body, 'modal-wide');
  }

  function openExecModal(seatId) {
    const seat = EXEC_SEATS.find((s) => s.id === seatId);
    if (!seat) return;
    const list = execCandidates(state).slice(0, 12);
    if (!list.length) {
      modalShell(`任命 ${seat.name}`, '公司还没有员工', '<div class="empty">先招人。</div>');
      return;
    }
    const cur = execOf(state, seatId);
    const body = `<div class="tiny dim" style="margin-bottom:8px">${seat.desc}</div>
      <table class="tbl">
      <thead><tr><th>姓名</th><th>部门</th><th class="num">能力</th><th class="num">沟通</th><th class="num">预期加成</th><th></th></tr></thead>
      <tbody>${list.map((e) => {
        const b = leaderBonus(e) * 0.6;
        return `<tr>
          <td><b>${esc(e.name)}</b>${cur && cur.id === e.id ? ' <span class="chip good">现任</span>' : ''}</td>
          <td class="tiny">${(DEPT_DEFS.find((d) => d.id === e.deptId) || {}).name || '—'}</td>
          <td class="num">${Math.round(e.skill)}</td>
          <td class="num">${e.comm}</td>
          <td class="num ${b > 0 ? 'good' : ''}">${b >= 0 ? '+' : ''}${Math.round(b * 100)}%</td>
          <td class="num"><button class="btn small ${cur && cur.id === e.id ? 'ghost' : 'primary'}" data-act="appoint-exec" data-seat="${seatId}" data-id="${e.id}">${cur && cur.id === e.id ? '连任' : '任命'}</button></td>
        </tr>`;
      }).join('')}</tbody></table>`;
    modalShell(`任命 ${seat.name}`, '高管席位对该职能有额外加成', body, 'modal-wide');
  }

  function openTrainingModal(empId) {
    const e = state.employees.find((x) => x.id === empId);
    if (!e) return;
    const rk = rankOf(e.skill);
    const body = `<div class="build-grid">
      ${TRAININGS.map((t) => {
        const monthly = trainingCost(state, t);
        const ok = state.company.cash >= monthly && !e.training;
        const eff = Object.entries(t.effect).map(([k, v]) => {
          const label = { skill: '能力', eff: '效率', comm: '沟通', creativity: '创造力', loyalty: '忠诚', satisfaction: '满意度', quality: '品质意识' }[k] || k;
          return `${label} +${v}`;
        }).join(' · ');
        return `<div class="build-card ${ok ? '' : 'disabled'}">
          <div class="between"><b>${t.icon} ${t.name}</b><span class="chip">${t.months} 个月</span></div>
          <div class="tiny dim" style="margin:6px 0 8px;min-height:34px">${t.desc}</div>
          <div class="tiny"><span class="dim">每月费用</span> <b>${fmtMoney(monthly)}</b></div>
          <div class="tiny dim" style="margin-top:4px">结业收益：${eff}</div>
          <div class="tiny dim" style="margin-top:2px">总投入 ${fmtMoney(monthly * t.months)}</div>
          <button class="btn small primary" style="margin-top:9px;width:100%" data-act="train" data-id="${empId}" data-program="${t.id}" ${ok ? '' : 'disabled'}>
            ${e.training ? '培训中' : state.company.cash < monthly ? '资金不足' : '开始培训'}
          </button>
        </div>`;
      }).join('')}
    </div>`;
    modalShell(`培训 · ${esc(e.name)}`,
      `${rk.name} · 能力 ${Math.round(e.skill)} · 效率 ${e.eff} · 满意度 ${Math.round(e.satisfaction)} · 月薪 ${fmtMoney(e.salary)}`,
      body, 'modal-wide');
  }

  // ---------- 布局编辑：3D 内直接编辑（office.js 编辑模式）+ 2D 平面规划页（floorplan2d.js） ----------
  // 两端共用 state.officeLayout 与 floorplan.js 校验层，任一端改动实时同步
  let floorplanUI = null;
  function afterLayoutChange() {
    paintTopbar();
    if (scene) scene.updateLayout();
  }
  function openFloorplan() {
    if (floorplanUI) return;
    floorplanUI = openFloorplanPlanner(document.body, state, {
      onChanged: afterLayoutChange,
      onToast: (m, k) => opts.onToast?.(m, k),
      onClose: () => { floorplanUI = null; },
    });
  }

  function openStage(modelId) {
    const pending = state.models.filter((m) => m.status === 'production' && !m.released);
    if (!pending.length) {
      opts.onToast?.('没有待发布机型：先在产品页把新机型量产上市', 'warn');
      return;
    }
    const lead = pending.find((m) => m.id === modelId) || pending[0];
    const selected = new Set([lead.id]);
    const costOf = () => 5000000 + Math.max(0, selected.size - 1) * 1500000;
    const suggested = Math.max(1, Math.round(suggestedPrice(state, lead, 'cn')));
    const d = derive(lead.design, state.date.year);
    // 卖点选择：主推机型最强的一项就是媒体答案
    const dims = [
      { id: 'camera', name: '影像', icon: '📷', v: d.camera },
      { id: 'perf', name: '性能', icon: '⚡', v: d.perf },
      { id: 'battery', name: '续航', icon: '🔋', v: d.battery },
      { id: 'design', name: '设计', icon: '✦', v: d.designScore },
    ];
    const bestDim = [...dims].sort((a, b) => b.v - a.v)[0];
    // 定价猜谜：三个候选价位中恰好一个是市场心理价位（随机打乱顺序）
    const candidates = (() => {
      const list = [
        { v: Math.round(suggested * (0.84 + Math.random() * 0.05)), correct: false },
        { v: suggested, correct: true },
        { v: Math.round(suggested * (1.12 + Math.random() * 0.06)), correct: false },
      ];
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    })();

    let phase = 'select';
    let pricePick = null;
    let pitchPick = null;
    const body = `<div class="stage-3d" id="stage-scene"></div>
      <div id="stage-panel" class="stage-panel"></div>`;
    const { mask, close } = modalShell('全球新品发布会',
      `主推 ${esc(lead.name)}${pending.length > 1 ? ` · ${pending.length} 款待发布` : ''}`, body, 'modal-wide');

    let stage = null;
    try {
      stage = createStageScene(mask.querySelector('#stage-scene'), state, lead);
    } catch (e) {
      const el = mask.querySelector('#stage-scene');
      if (el) el.innerHTML = `<div class="empty">3D 舞台初始化失败：${esc(e.message)}</div>`;
    }
    const done = () => { stage?.destroy(); close(); };
    const panel = mask.querySelector('#stage-panel');
    const stageBox = mask.querySelector('#stage-scene');

    const renderSelect = () => {
      phase = 'select';
      const cost = costOf();
      panel.innerHTML = `<div class="stage-question">选择本次发布的机型（每款机型只能发布一次，可多机同场）</div>
        <div class="stage-release-list">
          ${pending.map((m) => `<label class="stage-release-item ${selected.has(m.id) ? 'on' : ''}">
            <input type="checkbox" data-release="${m.id}" ${selected.has(m.id) ? 'checked' : ''} ${m.id === lead.id ? 'disabled' : ''} />
            <span style="flex:1;min-width:0"><b>${esc(m.name)}</b><div class="tiny dim">${m.id === lead.id ? '主推机型 · ' : ''}建议价 ¥${fmtNum(suggestedPrice(state, m, 'cn'))} · 热度 ${Math.round(m.heat === undefined ? 100 : m.heat)}</div></span>
            <span class="chip">¥${fmtNum(suggestedPrice(state, m, 'cn'))} 起</span>
          </label>`).join('')}
        </div>
        <div class="between" style="margin:10px 0 8px"><span class="tiny dim">费用：基础 ¥500万，每增加 1 款 +¥150万</span><b class="mono" id="stage-cost">${fmtMoney(cost)}</b></div>
        <button class="btn primary" id="stage-start" ${state.company.cash < cost ? 'disabled' : ''}>开始发布会（${fmtMoney(cost)}）</button>`;
    };

    const renderGuess = () => {
      phase = 'guess';
      panel.innerHTML = `<div class="stage-question">市场心理价位是多少？以主推机型 <b>${esc(lead.name)}</b> 为准，选一个最接近消费者预期的定价</div>
        <div class="stage-choices">${candidates.map((c, i) => `<button class="btn stage-choice" data-guess="${i}">¥${fmtNum(c.v)}</button>`).join('')}</div>
        <div class="tiny dim">猜中可得额外热度与品牌加成；猜错会让现场反响打折。</div>`;
    };

    const renderPitch = () => {
      phase = 'pitch';
      panel.innerHTML = `<div class="stage-question">媒体最关心这款产品的什么？选择本次主打的卖点</div>
        <div class="stage-choices">${dims.map((dim) => `<button class="btn stage-choice" data-pitch="${dim.id}">${dim.icon}<div>${dim.name}</div><div class="tiny dim">${Math.round(dim.v)} 分</div></button>`).join('')}</div>
        <div class="tiny dim">与主推机型最强项一致可获得额外现场加成；错位会被媒体追问。</div>`;
    };

    const finish = () => {
      const pick = pricePick || candidates[0];
      const priceHit = !!pick.correct;
      const pitchHit = pitchPick === bestDim.id;
      const cost = costOf();
      if (state.company.cash < cost) { opts.onToast?.('现金不足，无法完成发布会结算', 'bad'); return; }
      phase = 'result';
      if (stageBox) stageBox.style.height = '240px';
      const avg = (d.designScore + d.perf + d.camera + d.battery) / 4;
      const priceBonus = priceHit ? 0.09 : -0.02;
      const scoreBonus = clamp((avg - 55) / 100 * 0.12, -0.04, 0.08);
      const pitchBonus = pitchHit ? 0.03 : -0.01;
      const mul = +(1.16 + priceBonus + scoreBonus + pitchBonus).toFixed(2);
      state.company.cash -= cost;
      state.hype = { months: 3, mul };
      const released = pending.filter((m) => selected.has(m.id));
      const perHeat = (priceHit ? 18 : 8) + (pitchHit ? 6 : 0);
      for (const m of released) {
        m.released = true;
        m.stageAt = { ...state.date };
        m.heat = clamp((m.heat === undefined ? 55 : m.heat) + perHeat, 0, 120);
      }
      const brandGain = 3.2 + (priceHit ? 1.2 : 0) + (pitchHit ? 0.8 : 0)
        + clamp((avg - 60) / 20, 0, 1.2) + Math.max(0, released.length - 1) * 0.4;
      state.company.brand = clamp(state.company.brand + brandGain, 0, 100);
      const names = released.map((m) => m.name).join('、');
      addLog(state, 'mkt', `举办全球新品发布会，发布 ${names}；主推 ${lead.name}，定价 ${fmtMoney(pick.v)}（${priceHit ? '精准命中' : '偏离预期'}），需求系数 ×${mul}，品牌 +${brandGain.toFixed(1)}。`);
      state.news = state.news || [];
      state.news.unshift({
        time: `${state.date.year}/${state.date.month + 1}`, type: 'group',
        title: `${names} 发布会${priceHit ? '定价精准' : '反响平淡'}`,
        text: `发布 ${released.length} 款 · 现场评分 ${Math.round(avg)} · 3 个月需求系数 ×${mul} · 品牌 +${brandGain.toFixed(1)}。`, read: false,
      });
      if (state.news.length > 100) state.news.length = 100;
      const reaction = avg >= 78 ? '全场沸腾，媒体给出极高评价'
        : avg >= 66 ? '现场反响热烈'
          : avg >= 55 ? '反响平稳，亮点有限' : '现场略显冷淡';
      panel.innerHTML = `<div class="stage-result ${priceHit && pitchHit ? '' : 'warn'}">
          <div class="stage-result-head">
            <b>${priceHit && pitchHit ? '发布会大获成功' : priceHit || pitchHit ? '发布会中规中矩' : '发布会反响偏冷'}</b>
            <span class="chip ${priceHit ? 'good' : 'bad'}">${priceHit ? '定价精准' : '定价偏离'}</span>
            <span class="chip ${pitchHit ? 'good' : 'bad'}">${pitchHit ? '卖点命中' : '卖点错位'}</span>
          </div>
          <div class="stage-metrics">
            <div class="stage-metric"><span>现场评分</span><b>${Math.round(avg)}</b><i>${reaction}</i></div>
            <div class="stage-metric"><span>需求系数</span><b>×${mul}</b><i>3 个月</i></div>
            <div class="stage-metric"><span>品牌加成</span><b>+${brandGain.toFixed(1)}</b><i>${priceHit ? '定价加分' : '定价扣分'}</i></div>
            <div class="stage-metric"><span>发布会费用</span><b>${fmtMoney(cost)}</b><i>${released.length} 款同发</i></div>
          </div>
          <div class="stage-result-lines">
            <div><span class="dim">主推</span><b>${esc(lead.name)}</b> · 选择 ¥${fmtNum(pick.v)} · 市场心理价 ¥${fmtNum(suggested)}</div>
            <div><span class="dim">媒体关注</span>${bestDim.icon} ${bestDim.name}（${Math.round(bestDim.v)} 分）· 你的选择：${dims.find((x) => x.id === pitchPick)?.name || '—'}</div>
            <div><span class="dim">发布机型</span>${esc(names)}</div>
            <div><span class="dim">每款热度</span>+${perHeat}（上限 120）· 发布前基础热度约 55</div>
          </div>
        </div>
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px">
          <button class="btn" id="stage-goto">查看产品</button>
          <button class="btn primary" id="stage-done">结束发布会</button>
        </div>`;
      sfx('launch');
    };

    panel.addEventListener('change', (e) => {
      const cb = e.target.closest('[data-release]');
      if (!cb || phase !== 'select') return;
      if (cb.checked) selected.add(cb.dataset.release);
      else selected.delete(cb.dataset.release);
      if (!selected.size) selected.add(lead.id); // 主推机型必须保留
      renderSelect();
    });

    panel.addEventListener('click', (e) => {
      if (e.target.closest('#stage-done')) { done(); render(); return; }
      if (e.target.closest('#stage-goto')) { done(); tab = 'product'; render(); return; }
      if (phase === 'select' && e.target.closest('#stage-start')) {
        if (state.company.cash < costOf()) { opts.onToast?.('资金不足，无法举办发布会', 'bad'); return; }
        renderGuess();
        return;
      }
      if (phase === 'guess') {
        const g = e.target.closest('[data-guess]');
        if (g) { pricePick = candidates[Number(g.dataset.guess)]; renderPitch(); }
        return;
      }
      if (phase === 'pitch') {
        const p = e.target.closest('[data-pitch]');
        if (p) { pitchPick = p.dataset.pitch; finish(); }
        return;
      }
    });
    renderSelect();
    // 舞台场景随弹窗关闭一并释放
    const observer = new MutationObserver(() => {
      if (!document.body.contains(mask)) { stage?.destroy(); observer.disconnect(); }
    });
    observer.observe(document.body, { childList: true });
  }

  // 收购谈判弹窗：多轮出价，显示对方要价/情绪/回合
  // 研发立项弹窗：命名 + 规格设计（芯片核心构成/GPU、传感器底大小/像素、OS 底层、面板类型/分辨率）
  // ---------- 屏幕设计 / 宣传图 / 通知与新闻 / OS 发版 ----------
  let screenDesignUI = null;
  function openScreenDesignUI() {
    if (screenDesignUI) return;
    screenDesignUI = openScreenDesign(document.body, state, {
      onClose: () => { screenDesignUI = null; },
      onToast: (m, k) => opts.onToast?.(m, k),
    });
  }

  let posterUI = null;
  function openPoster(modelId) {
    const m2 = state.models.find((x) => x.id === modelId);
    if (!m2) return;
    if (posterUI) { try { posterUI.destroy?.(); } catch (e) { /* 忽略 */ } posterUI = null; }
    posterUI = openPosterStudio(document.body, state, m2, {
      onClose: () => { posterUI = null; },
      onToast: (m3, k) => opts.onToast?.(m3, k),
    });
  }

  // ---------- 右上角 ☰ 菜单：保存存档 / 设置 / 返回主菜单 + 游戏信息 ----------
  function gameMenu() {
    document.querySelector('.modal-mask')?.remove();
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `<div class="modal" style="width:min(440px,94vw)">
      <h2>菜单</h2>
      <div class="modal-sub">${esc(state.company.name)} · ${fmtDate(state.date)}</div>
      <div class="list">
        <div class="list-item" data-gm="save" style="cursor:pointer">
          <div style="flex:1"><b>保存存档</b><div class="tiny dim">选择槽位保存 · 自动存档每回合都会进行</div></div><span class="tiny dim">▸</span>
        </div>
        <div class="list-item" data-gm="settings" style="cursor:pointer">
          <div style="flex:1"><b>设置</b><div class="tiny dim">音量、画质、引导与存档文件</div></div><span class="tiny dim">▸</span>
        </div>
        <div class="list-item" data-gm="exit" style="cursor:pointer">
          <div style="flex:1"><b>返回主菜单</b><div class="tiny dim">退出前可保存进度</div></div><span class="tiny dim">▸</span>
        </div>
      </div>
      <div class="card" style="margin-top:10px;padding:10px 12px;background:rgba(255,255,255,.02)">
        <div class="card-title" style="margin-bottom:6px">游戏信息</div>
        <div class="tiny" style="line-height:2">
          <div class="between"><span class="dim">模式</span><b>${state.mode === 'career' ? '经营模式' : '自由沙盒'}</b></div>
          <div class="between"><span class="dim">开局年份</span><b>${state.company.founded}</b></div>
          <div class="between"><span class="dim">当前日期</span><b>${fmtDate(state.date)}</b></div>
          <div class="between"><span class="dim">已掌握技术</span><b>${state.tech.unlocked.length} 项</b></div>
          <div class="between"><span class="dim">历史机型</span><b>${state.models.length} 款</b></div>
        </div>
        <div class="tiny dim" style="line-height:1.9;margin-top:6px">键位：空格 暂停/继续 · 1-4 速度 · Esc 退出设计器</div>
        ${state.mode === 'sandbox' ? `<label class="field" style="margin-top:6px"><span>沙盒工具 · 直接设置现金</span>
          <input type="number" id="gm-cash" value="${Math.round(state.company.cash)}" step="10000000" /></label>
        <div class="row" style="gap:8px;margin-top:8px">
          <button class="btn small ${state.sandboxInstant?.research ? 'primary' : 'ghost'}" id="gm-ir">研究瞬间完成：${state.sandboxInstant?.research ? '开' : '关'}</button>
          <button class="btn small ${state.sandboxInstant?.build ? 'primary' : 'ghost'}" id="gm-ib">建设瞬间完成：${state.sandboxInstant?.build ? '开' : '关'}</button>
        </div>` : ''}
      </div>
      <div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn" data-close>关闭</button></div>
    </div>`;
    document.body.appendChild(mask);
    const close = () => mask.remove();
    mask.querySelector('[data-close]').onclick = close;
    mask.onclick = (e) => { if (e.target === mask) close(); };
    mask.addEventListener('click', (e) => {
      const item = e.target.closest('[data-gm]');
      if (!item) return;
      if (item.dataset.gm === 'save') { close(); slotPicker(); }
      else if (item.dataset.gm === 'settings') { close(); settingsPanel(); }
      else if (item.dataset.gm === 'exit') { close(); openExitConfirm(); }
    });
    const cash = mask.querySelector('#gm-cash');
    if (cash) cash.onchange = () => {
      state.company.cash = Number(cash.value) || 0;
      opts.onToast?.('现金已设置', 'good');
      paintTopbar();
    };
    const ir = mask.querySelector('#gm-ir');
    if (ir) ir.onclick = () => {
      state.sandboxInstant = state.sandboxInstant || {};
      state.sandboxInstant.research = !state.sandboxInstant.research;
      ir.textContent = `研究瞬间完成：${state.sandboxInstant.research ? '开' : '关'}`;
      ir.className = 'btn small ' + (state.sandboxInstant.research ? 'primary' : 'ghost');
      opts.onToast?.(state.sandboxInstant.research ? '研究将瞬间完成' : '恢复正常研发速度', 'good');
    };
    const ib = mask.querySelector('#gm-ib');
    if (ib) ib.onclick = () => {
      state.sandboxInstant = state.sandboxInstant || {};
      state.sandboxInstant.build = !state.sandboxInstant.build;
      ib.textContent = `建设瞬间完成：${state.sandboxInstant.build ? '开' : '关'}`;
      ib.className = 'btn small ' + (state.sandboxInstant.build ? 'primary' : 'ghost');
      opts.onToast?.(state.sandboxInstant.build ? '建设将瞬间完成' : '恢复正常建造速度', 'good');
    };
  }

  // 保存存档：槽位选择（保存 / 读取 / 删除）
  function slotPicker() {
    document.querySelector('.modal-mask')?.remove();
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    const renderSlots = () => {
      const slots = saveSlots();
      mask.innerHTML = `<div class="modal" style="width:min(480px,94vw)">
        <h2>保存存档</h2>
        <div class="modal-sub">选择槽位 · 自动存档每回合都会进行</div>
        <div class="list">
          ${slots.map((s) => `<div class="list-item">
            <div style="flex:1"><b>槽位 ${s.slot}</b> ${s.empty ? '<span class="tiny dim">空</span>' : s.name}
              <div class="tiny dim">${s.empty ? '—' : `${s.date.year}年${s.date.month + 1}月 · 现金 ${fmtMoney(s.cash)} · ${s.models} 款机型`}</div></div>
            <button class="btn small primary" data-sp="save" data-slot="${s.slot}">保存</button>
            <button class="btn small" data-sp="load" data-slot="${s.slot}" ${s.empty ? 'disabled' : ''}>读取</button>
            <button class="btn small ghost danger" data-sp="del" data-slot="${s.slot}" ${s.empty ? 'disabled' : ''}>删除</button>
          </div>`).join('')}
        </div>
        <div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn" data-close>关闭</button></div>
      </div>`;
      mask.querySelector('[data-close]').onclick = () => mask.remove();
      mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
      mask.querySelectorAll('[data-sp]').forEach((b) => {
        b.onclick = () => {
          const n = Number(b.dataset.slot);
          if (b.dataset.sp === 'save') {
            saveGame(state, n);
            opts.onToast?.(`已保存到槽位 ${n}`, 'good');
            sfx('good');
            renderSlots();
          } else if (b.dataset.sp === 'load') {
            const s2 = loadGame(n);
            if (!s2) { opts.onToast?.('槽位为空', 'warn'); return; }
            stop();
            if (designer) { designer.destroy(); designer = null; }
            mask.remove();
            opts.onLoad?.(s2);
          } else {
            deleteSave(n);
            opts.onToast?.(`槽位 ${n} 已删除`, 'good');
            renderSlots();
          }
        };
      });
    };
    renderSlots();
    document.body.appendChild(mask);
  }

  // ---------- 统一设置弹窗（主菜单 / 游戏内共用结构） ----------
  function settingsPanel() {
    document.querySelector('.modal-mask')?.remove();
    const q = readQualityPref();
    const on = audioEnabled();
    const g = state.guide;
    const gOn = !(g?.skipped) && (g?.step || 0) < GUIDE_STEPS.length;
    const QUALS = [['auto', '自动'], ['high', '高'], ['standard', '标准'], ['low', '流畅']];
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `<div class="modal" style="width:min(480px,94vw)">
      <h2>设置</h2>
      <div class="modal-sub">音效与画质保存在本设备</div>
      <div class="list">
        <div class="list-item">
          <div style="flex:1"><b>音效</b><div class="tiny dim">界面与事件音效</div></div>
          <button class="btn small ${on ? 'primary' : 'ghost'}" data-set="audio">${on ? '已开启' : '已关闭'}</button>
        </div>
        <div class="list-item" style="display:block">
          <label class="field"><span>音量 <b>${Math.round(audioVolume() * 100)}%</b></span>
            <input type="range" id="set-vol" min="0" max="100" step="5" value="${Math.round(audioVolume() * 100)}" style="width:100%" /></label>
        </div>
        <div class="list-item" style="display:block">
          <b>画面质量</b>
          <div class="tiny dim" style="margin:4px 0">影响园区 3D 的分辨率与阴影，低端设备建议「标准」或「流畅」</div>
          <div class="row">${QUALS.map(([k, n]) => `<button class="btn small ${q === k ? 'primary' : 'ghost'}" data-set="q" data-q="${k}">${n}${q === k ? ' ✓' : ''}</button>`).join('')}</div>
        </div>
        <div class="list-item">
          <div style="flex:1"><b>新手引导</b><div class="tiny dim">当前${gOn ? `进行到第 ${(g?.step || 0) + 1} 步` : g && g.step >= GUIDE_STEPS.length ? '已完成' : '已关闭'}</div></div>
          <button class="btn small ${gOn ? 'ghost' : 'primary'}" data-set="guide">${gOn ? '关闭引导' : '开启引导'}</button>
        </div>
        <div class="list-item" style="display:block">
          <b>存档文件（跨设备迁移）</b>
          <div class="tiny dim" style="margin:4px 0">导出为 .json 备份或带到其他设备 / APP；导入会替换当前进度，建议先导出备份</div>
          <div class="row">
            <button class="btn small" data-set="export">⬇ 导出存档文件</button>
            <button class="btn small" data-set="import">⬆ 导入存档文件</button>
            <input type="file" id="set-import-file" accept=".json,application/json" style="display:none" />
          </div>
        </div>
        <div class="list-item" style="opacity:.55">
          <div style="flex:1"><b class="dim">更多设置</b><div class="tiny dim">敬请期待</div></div><span class="tiny dim">—</span>
        </div>
      </div>
      <div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn" data-close>关闭</button></div>
    </div>`;
    document.body.appendChild(mask);
    const close = () => mask.remove();
    mask.querySelector('[data-close]').onclick = close;
    mask.onclick = (e) => { if (e.target === mask) close(); };
    const QN = { auto: '自动', high: '高', standard: '标准', low: '流畅' };
    mask.querySelector('[data-set="audio"]').onclick = (e) => {
      unlockAudio();
      const on2 = setAudioEnabled(!audioEnabled());
      e.target.textContent = on2 ? '已开启' : '已关闭';
      e.target.className = 'btn small ' + (on2 ? 'primary' : 'ghost');
      if (on2) sfx('good');
    };
    const vol = mask.querySelector('#set-vol');
    vol.oninput = () => {
      unlockAudio();
      setAudioVolume(Number(vol.value) / 100);
      vol.closest('.field').querySelector('b').textContent = Math.round(audioVolume() * 100) + '%';
    };
    mask.querySelectorAll('[data-set="q"]').forEach((b) => {
      b.onclick = () => {
        writeQualityPref(b.dataset.q);
        mask.querySelectorAll('[data-set="q"]').forEach((x) => {
          const sel = x.dataset.q === b.dataset.q;
          x.className = 'btn small ' + (sel ? 'primary' : 'ghost');
          x.textContent = QN[x.dataset.q] + (sel ? ' ✓' : '');
        });
        opts.onToast?.(`画质已设为「${QN[b.dataset.q]}」，进入园区 3D 后生效`, 'good');
      };
    });
    mask.querySelector('[data-set="guide"]').onclick = (e) => {
      if (state.guide?.skipped || (state.guide?.step || 0) >= GUIDE_STEPS.length) { restartGuide(state); opts.onToast?.('新手引导已开启', 'good'); }
      else { skipGuide(state); opts.onToast?.('新手引导已关闭', 'good'); }
      const g2 = state.guide;
      const gOn2 = !(g2?.skipped) && (g2?.step || 0) < GUIDE_STEPS.length;
      const row = e.target.closest('.list-item');
      row.querySelector('.tiny.dim').textContent = `当前${gOn2 ? `进行到第 ${(g2?.step || 0) + 1} 步` : g2 && g2.step >= GUIDE_STEPS.length ? '已完成' : '已关闭'}`;
      e.target.textContent = gOn2 ? '关闭引导' : '开启引导';
      e.target.className = 'btn small ' + (gOn2 ? 'ghost' : 'primary');
    };
    mask.querySelector('[data-set="export"]').onclick = () => {
      try {
        const blob = new Blob([exportSave(state)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `手机开发商_${state.company.name}_${state.date.year}年${state.date.month + 1}月.mm save.json`.replace(/\s+/g, '_');
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        opts.onToast?.('存档已导出为文件', 'good');
      } catch (e2) { opts.onToast?.('导出失败：' + e2.message, 'bad'); }
    };
    const f = mask.querySelector('#set-import-file');
    f.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          state = importSave(String(reader.result));
          lastReport = null;
          opts.onToast?.('存档已导入，进度已替换', 'good');
          sfx('good');
          close();
          render();
        } catch (err) { opts.onToast?.('导入失败：' + err.message, 'bad'); }
      };
      reader.readAsText(file);
    };
  }

  function openNewsPanel() {
    const news = state.news || [];
    const unread = news.filter((n) => !n.read).length;
    const hist = (state.history || []).slice(-12).reverse();
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `<div class="modal" style="width:min(640px,94vw);max-height:80vh;display:flex;flex-direction:column">
      <div class="between"><h2 style="margin:0">通知与新闻</h2><button class="btn small ghost" data-close>关闭</button></div>
      <div class="modal-sub">${unread ? `${unread} 条未读` : '全部已读'}</div>
      <div style="flex:1;overflow-y:auto;padding:0 2px">
        ${news.length ? news.map((n, i) => `
          <div data-news="${i}" style="border-left:3px solid ${n.type === 'competitor' ? '#f56b6b' : n.type === 'award' ? '#f5a542' : '#4aa3ff'};margin-bottom:6px;border-radius:6px;padding:8px 10px;${n.read ? 'opacity:.5' : 'background:rgba(74,163,255,.06)'}">
            <div class="between"><b class="tiny">${esc(n.title)}</b><span class="tiny dim">${esc(n.time)}</span></div>
            ${n.text ? `<div class="tiny dim" style="margin-top:2px">${esc(n.text)}</div>` : ''}
          </div>`).join('') : '<div class="empty">暂无消息</div>'}
        ${hist.length ? `<div class="tiny dim" style="margin:10px 0 4px">月度报告归档</div>
        ${hist.map((h) => `<div class="between tiny" style="padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.05)"><span>${h.y}/${h.m + 1} 月度报告</span><span class="dim">净利 ${fmtMoney(h.net || 0)}</span></div>`).join('')}` : ''}
      </div>
      <div class="row" style="margin-top:10px;justify-content:flex-end">
        <button class="btn small" data-news-read>全部标为已读</button>
      </div>
    </div>`;
    document.body.appendChild(mask);
    const close = () => mask.remove();
    mask.querySelector('[data-close]').onclick = close;
    mask.addEventListener('click', (e) => {
      const item = e.target.closest('[data-news]');
      if (item) {
        const n = news[Number(item.dataset.news)];
        if (n) { n.read = true; item.style.opacity = '.5'; paintTopbar(); }
        return;
      }
      if (e.target.closest('[data-news-read]')) {
        news.forEach((n) => { n.read = true; });
        paintTopbar();
        close();
        render();
        return;
      }
      if (e.target === mask) close();
    });
  }

  function openOsReleaseModal() {
    const os = state.osPop || { version: 0 };
    const cost = osReleaseCost(state);
    const body = `
      <div class="tiny dim" style="margin:4px 0 8px">大版本迭代：提升系统流行度上限与评分加成。可自行为版本命名（如 StarOS ${os.version + 1}、HyperUI 5），留空则自动编号 v${os.version + 1}.0。</div>
      <div class="report-grid">
        <div class="line"><span>版本名称</span><input id="os-ver-name" maxlength="16" placeholder="v${os.version + 1}.0（留空自动编号）" style="flex:1" /></div>
      </div>
      <div class="row" style="margin-top:12px;justify-content:flex-end;gap:8px;align-items:center">
        <span class="tiny dim" style="margin-right:auto">发布费用 ${fmtMoney(cost)}</span>
        <button class="btn small primary" data-act="os-release-confirm" ${state.company.cash < cost ? 'disabled' : ''}>确认发布</button>
      </div>`;
    modalShell('发布自研系统新版本', '系统开发部 · 自研 OS 生态', body, '');
  }

  function openRndModal(id, mode = 'upgrade') {
    const def = DIVISION_DEFS[id];
    const lv = state.divisions?.[id]?.level || 0;
    const cost = upgradeCost(id, lv);
    const year = state.date.year;
    const archOpts = (kind) => CPU_CORES.filter((a) => a.kind === kind).map((a) => `<option value="${a.id}">${a.name}${a.year > year ? `（${a.year} 年）` : ''}</option>`).join('');
    const fmtOpts = ['1″', '1/1.12″', '1/1.3″', '1/1.4″', '1/1.56″', '1/2″', '1/2.76″', '1/3″', '1/4″'];
    const body = () => {
      let form = '';
      if (id === 'chip') {
        form = `
          <div class="tiny dim" style="margin:4px 0">CPU 核心构成（参考现实：旗舰 = 1 超大核 + 5 大核 + 2 小核）。同代芯片需用相近世代的架构；自研核不与公版核混排；小核可选「无」（骁龙 8 至尊版 = Oryon 2+6）</div>
          <div class="report-grid">
            <div class="line"><span>超大核架构</span><select id="rn-prime-arch"><option value="">无</option>${archOpts('prime')}</select></div>
            <div class="line"><span>超大核数量 / 主频</span><span class="row" style="gap:4px"><input id="rn-prime-n" type="number" min="0" max="2" value="1" style="width:52px" /> <input id="rn-prime-ghz" type="number" min="2" max="4.3" step="0.05" value="3.2" style="width:70px" /> GHz</span></div>
            <div class="line"><span>大核架构</span><select id="rn-big-arch">${archOpts('big')}</select></div>
            <div class="line"><span>大核数量 / 主频</span><span class="row" style="gap:4px"><input id="rn-big-n" type="number" min="1" max="6" value="4" style="width:52px" /> <input id="rn-big-ghz" type="number" min="1.6" max="3.2" step="0.05" value="2.8" style="width:70px" /> GHz</span></div>
            <div class="line"><span>小核架构</span><select id="rn-little-arch"><option value="">无</option>${archOpts('little')}</select></div>
            <div class="line"><span>小核数量 / 主频</span><span class="row" style="gap:4px"><input id="rn-little-n" type="number" min="1" max="6" value="4" style="width:52px" /> <input id="rn-little-ghz" type="number" min="1.2" max="2.4" step="0.05" value="2.0" style="width:70px" /> GHz</span></div>
            <div class="line"><span>GPU 架构</span><select id="rn-gpu-arch">${GPU_ARCHS.map((g) => `<option value="${g.id}">${g.name}${g.year > year ? `（${g.year} 年）` : ''}</option>`).join('')}</select></div>
            <div class="line"><span>GPU 核心</span><input id="rn-gpu-cores" type="number" min="1" max="24" value="10" style="width:70px" /></div>
          </div>`;
      } else if (id === 'optics') {
        form = `
          <div class="tiny dim" style="margin:4px 0">传感器规格（底越大画质越好，体积与成本越高）</div>
          <div class="report-grid">
            <div class="line"><span>传感器底大小</span><select id="rn-cm-format">${fmtOpts.map((f) => `<option value="${f}" ${f === '1/1.56″' ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
            <div class="line"><span>总像素 (MP)</span><input id="rn-cm-mp" type="number" min="0.1" max="400" value="50" style="width:80px" /></div>
            <div class="line"><span>镜头类型</span><select id="rn-cm-type">${LENS_TYPES.map((t) => `<option value="${t.id}" ${t.id === 'main' ? 'selected' : ''}>${t.name}</option>`).join('')}</select></div>
            <div class="line"><span>等效焦距 (mm)</span><input id="rn-cm-focal" type="number" min="8" max="160" value="23" style="width:80px" /></div>
            <div class="line"><span>光圈 ƒ/</span><input id="rn-cm-ap" type="number" min="0.95" max="4" step="0.1" value="1.7" style="width:80px" /></div>
            <div class="line"><span>光学防抖</span><label class="opt on" style="display:inline-flex;gap:5px;align-items:center"><input id="rn-cm-ois" type="checkbox" checked style="width:auto" /> OIS</label></div>
          </div>`;
      } else if (id === 'osd') {
        form = `
          <div class="tiny dim" style="margin:4px 0">系统底层架构决定生态兼容性与性能上限</div>
          <div class="report-grid">
            <div class="line"><span>底层架构</span><select id="rn-os-base">${OS_BASES.map((b) => `<option value="${b.id}" ${b.year > year ? 'disabled' : ''}>${b.name}${b.year > year ? `（${b.year} 年）` : ''}</option>`).join('')}</select></div>
          </div>
          <div class="tiny dim" id="rn-os-desc" style="margin-top:6px"></div>`;
      } else if (id === 'panel') {
        form = `
          <div class="tiny dim" style="margin:4px 0">面板类型与分辨率档位</div>
          <div class="report-grid">
            <div class="line"><span>面板类型</span><select id="rn-pn-kind"><option value="lcd">LCD</option><option value="oled">OLED</option><option value="miniled" ${year < 2021 ? 'disabled' : ''}>Mini-LED${year < 2021 ? '（2021 年）' : ''}</option></select></div>
            <div class="line"><span>分辨率</span><select id="rn-pn-res">${RES_TIERS.map((r) => `<option value="${r.id}" ${r.year > year ? 'disabled' : ''}>${r.name}${r.year > year ? `（${r.year} 年）` : ''}</option>`).join('')}</select></div>
          </div>`;
      }
      return `
        <label class="field"><span>项目名称</span><input id="rn-name" maxlength="16" placeholder="如：玄戒 / 星辰 OS / 晶核屏" /></label>
        ${form}
        <div id="rn-preview" class="tiny" style="margin:10px 0;padding:8px;border-radius:8px;background:rgba(255,255,255,.04);line-height:1.9">填写规格后自动预览。</div>
        <div class="row" style="gap:6px">
          <button class="btn small primary" id="rn-go">立项研发（${fmtMoney(cost)}）</button>
          <button class="btn small ghost" data-act="close-modal">取消</button>
        </div>
        <div class="tiny dim" style="margin-top:6px">规格受年代与架构发布时间限制；越激进的规格性能越高，但功耗与成本也越高。</div>`;
    };
    const { mask } = modalShell(`${def.name} · 研发立项`, `Lv.${lv} → Lv.${lv + 1} · 命名并设计自研规格`, body(), 'modal-wide');
    const collect = () => ({
      name: mask.querySelector('#rn-name')?.value || '',
      ...(id === 'chip' ? {
        primeArch: mask.querySelector('#rn-prime-arch')?.value || '', primeN: mask.querySelector('#rn-prime-n')?.value,
        primeGhz: mask.querySelector('#rn-prime-ghz')?.value, bigArch: mask.querySelector('#rn-big-arch')?.value,
        bigN: mask.querySelector('#rn-big-n')?.value, bigGhz: mask.querySelector('#rn-big-ghz')?.value,
        littleArch: mask.querySelector('#rn-little-arch')?.value, littleN: mask.querySelector('#rn-little-n')?.value,
        littleGhz: mask.querySelector('#rn-little-ghz')?.value, gpuArch: mask.querySelector('#rn-gpu-arch')?.value,
        gpuCores: mask.querySelector('#rn-gpu-cores')?.value,
      } : {}),
      ...(id === 'optics' ? {
        sensorFormat: mask.querySelector('#rn-cm-format')?.value, mp: mask.querySelector('#rn-cm-mp')?.value,
        lensType: mask.querySelector('#rn-cm-type')?.value, focal: mask.querySelector('#rn-cm-focal')?.value,
        ap: mask.querySelector('#rn-cm-ap')?.value, ois: mask.querySelector('#rn-cm-ois')?.checked,
      } : {}),
      ...(id === 'osd' ? { base: mask.querySelector('#rn-os-base')?.value } : {}),
      ...(id === 'panel' ? { kind: mask.querySelector('#rn-pn-kind')?.value, res: mask.querySelector('#rn-pn-res')?.value } : {}),
    });
    const preview = () => {
      const spec = computeCustomSpec(state, id, collect());
      const el = mask.querySelector('#rn-preview');
      if (id === 'osd') {
        const b = OS_BASES.find((x) => x.id === collect().base);
        if (el && b) el.innerHTML = `${esc(b.base)}<br/><span class="dim">${esc(b.desc)} · 性能 ×${b.scoreMul} · 生态 ×${b.appsMul} · 成本 ×${b.costMul}</span>`;
      }
      if (!spec) { if (el) el.textContent = '填写规格后自动预览。'; return; }
      if (!spec.ok) { if (el) el.innerHTML = `<span style="color:var(--warn,#f5a542)">⚠ ${spec.errors.map(esc).join('<br/>')}</span>`; return; }
      const line = id === 'chip' ? `性能 ${spec.perf} · 功耗 ${spec.power}W · 成本 ¥${spec.price}<br/><span class="dim">${esc(spec.desc)}</span>`
        : id === 'optics' ? `评分 ${spec.score} · ${esc(spec.desc)}<br/><span class="dim">模组厚 ${spec.thickness}mm · 成本 ¥${spec.price}</span>`
        : id === 'osd' ? `性能 ×${spec.scoreMul} · 生态 ×${spec.appsMul}<br/><span class="dim">${esc(spec.desc)}</span>`
        : `品质 ${spec.quality}<br/><span class="dim">${esc(spec.desc)}</span>`;
      if (el) el.innerHTML = `${line}`;
    };
    mask.addEventListener('input', preview);
    preview();
    mask.querySelector('#rn-go').onclick = () => {
      const spec = computeCustomSpec(state, id, collect());
      if (!spec || !spec.ok) { opts.onToast?.(spec?.errors?.[0] || '规格不完整', 'bad'); return; }
      let r;
      if (mode === 'design') {
        r = designProduct(state, id, spec);
      } else {
        r = startUpgrade(state, id, spec);
      }
      opts.onToast?.(r.msg, r.ok ? 'good' : 'bad');
      if (r.ok) { sfx('build'); closeModal(); render(); }
    };
  }

  // 员工档案：能力画像 / 状态与流失风险 / 特质 / 快捷操作（v1.5.0）
  function openEmpModal(empId) {
    const e = state.employees.find((x) => x.id === empId);
    if (!e) { opts.onToast?.('该员工已离职', 'warn'); return; }
    const rk = rankOf(e.skill);
    const dept = DEPT_DEFS.find((d) => d.id === e.deptId);
    const bar = (label, v, color = '#4aa3ff') => {
      const val = clamp(Number(v) || 0, 0, 100);
      return `<div class="between tiny" style="margin-top:6px"><span class="dim">${label}</span><b class="mono">${Math.round(val)}</b></div>
        <div class="bar" style="height:4px"><i style="width:${val}%;background:${color}"></i></div>`;
    };
    const body = `<div class="row" style="gap:12px;align-items:flex-start;margin-bottom:12px">
        <div style="width:54px;height:54px;border-radius:14px;background:#4aa3ff22;display:grid;place-items:center;font-size:20px;font-weight:700;color:#8fd0ff">${esc(String(e.name).slice(0, 1))}</div>
        <div style="flex:1;min-width:0">
          <div class="row" style="gap:8px;flex-wrap:wrap"><b style="font-size:16px">${esc(e.name)}${e.star ? ' ⭐' : ''}</b>
            <span class="rank-badge" style="background:${rk.color}22;color:${rk.color};border-color:${rk.color}66">${rk.name}</span></div>
          <div class="tiny dim" style="margin-top:4px">${e.gender || ''} · ${e.age} 岁 · ${e.edu || ''} · ${e.exp} 年经验 · ${e.field || ''}</div>
          <div class="tiny dim">${dept ? dept.name : '待分配'} · ${e.role} · 月薪 ¥${fmtNum(e.salary)}（期望 ¥${fmtNum(e.expectSalary)}）</div>
        </div>
      </div>
      <div class="two-col">
        <div class="card">
          <div class="card-title">能力画像</div>
          ${bar('能力', e.skill)}
          ${bar('效率', e.eff, '#37c9a5')}
          ${bar('创造力', e.creativity, '#c47cf0')}
          ${bar('沟通', e.comm, '#f5a542')}
          ${bar('质量意识', e.quality, '#8fd0ff')}
          ${bar('潜力', e.potential, '#ff9d5c')}
        </div>
        <div class="card">
          <div class="card-title">状态与风险</div>
          ${bar('满意度', e.satisfaction, e.satisfaction > 60 ? '#37c9a5' : '#f5a542')}
          ${bar('忠诚度', e.loyalty, '#4aa3ff')}
          ${bar('压力', e.stress, e.stress > 70 ? '#f56b6b' : '#8fd0ff')}
          <div class="between tiny" style="margin-top:10px"><span class="dim">月流失风险</span><b class="${(e.leaveRisk || 0) > 3 ? 'bad' : 'good'}">${(e.leaveRisk || 0).toFixed(1)}%</b></div>
          <div class="between tiny"><span class="dim">累计成长</span><b>+${(e.grew || 0).toFixed(1)}</b></div>
          <div class="between tiny"><span class="dim">培训</span><b>${e.training ? `${TRAINING_MAP[e.training.id]?.name || ''}（剩 ${e.training.monthsLeft} 月）` : '无'}</b></div>
        </div>
      </div>
      <div class="section-label">特质</div>
      <div class="row" style="gap:5px;flex-wrap:wrap">${traitNames(e).length ? traitNames(e).map((n) => `<span class="chip">${esc(n)}</span>`).join('') : '<span class="tiny dim">无</span>'}</div>
      <div class="row" style="gap:6px;margin-top:12px;justify-content:flex-end">
        <button class="btn small" id="emp-raise">加薪 10%</button>
        <button class="btn small" id="emp-train">安排培训</button>
        <button class="btn small ghost danger" id="emp-fire">解雇</button>
      </div>`;
    const { mask, close } = modalShell(`${e.name} · 员工档案`, `${e.role} · ${rk.name}`, body, 'modal-wide');
    mask.querySelector('#emp-raise').onclick = () => {
      e.salary = Math.round(e.salary * 1.1 / 100) * 100;
      e.expectSalary = Math.max(e.expectSalary, e.salary);
      e.satisfaction = clamp(e.satisfaction + 8, 0, 100);
      addLog(state, 'hr', `${e.name} 加薪至 ${fmtMoney(e.salary)}/月。`);
      close(); render();
    };
    mask.querySelector('#emp-train').onclick = () => { close(); openTrainingModal(e.id); };
    mask.querySelector('#emp-fire').onclick = () => {
      state.employees = state.employees.filter((x) => x.id !== e.id);
      state.company.cash -= e.salary * 2;
      addLog(state, 'hr', `解雇 ${e.name}，支付补偿 ${fmtMoney(e.salary * 2)}。`);
      close(); render();
    };
  }

  function openNegotiationModal(n0) {
    const comp = state.competitors.find((x) => x.id === n0.compId);
    if (!comp) { opts.onToast?.('对方公司已不存在', 'bad'); return; }
    let log = [`${n0.hostile ? '敌意收购' : '首轮'}：${comp.name} 开价 ${(n0.ask / 1e8).toFixed(2)} 亿${n0.hostile ? '（不还价）' : ''}。`];
    const totalOf = (n) => dealPrice(n, n.payMode || 'cash');
    const firstOf = (n) => {
      const total = totalOf(n);
      return (n.payMode || 'cash') === 'installment' ? Math.round(total * 0.35)
        : (n.payMode === 'equity' ? 0 : total);
    };
    const payButtons = () => PAY_MODES.map((p) => {
      const on = (state.negotiation?.payMode || 'cash') === p.id;
      return `<button class="btn tiny ${on ? 'primary' : ''}" data-pay="${p.id}" title="${esc(p.desc)}">${p.name}</button>`;
    }).join('');
    const body = () => {
      const n = state.negotiation || {};
      const mode = n.payMode || 'cash';
      const total = totalOf(n);
      const first = firstOf(n);
      const modeDef = PAY_MODES.find((p) => p.id === mode) || PAY_MODES[0];
      const mood = Math.round(n.mood || 50);
      const defense = Math.round((n.defense || 0) * 100);
      return `<div class="neg-grid">
          <div class="neg-panel">
            <div class="neg-title"><span>${esc(comp.name)}</span><span class="chip">品牌 ${comp.brand.toFixed(0)}</span></div>
            <div class="neg-ask-row"><span class="dim tiny">当前要价</span><b class="mono" id="neg-ask">${n.ask ? fmtMoney(n.ask) : '—'}</b></div>
            <div class="neg-bar"><span style="width:34px">防御</span><div class="bar"><i id="neg-defense-bar" style="width:${defense}%;background:#f5a542"></i></div><b id="neg-defense">${defense}%</b></div>
            <div class="neg-bar"><span style="width:34px">情绪</span><div class="bar"><i id="neg-mood-bar" style="width:${mood}%;background:#37c9a5"></i></div><b id="neg-mood">${mood}/100</b></div>
            <div class="tiny dim" style="margin-top:9px">第 ${n.rounds || 0} 轮 · ${n.hostile ? '敌意收购（不还价）' : '友好谈判'}</div>
          </div>
          <div class="neg-panel">
            <div class="neg-title"><span>我方方案</span><span class="chip">现金 ${fmtMoney(state.company.cash)}</span></div>
            <div class="row" style="gap:5px;flex-wrap:wrap;margin-top:8px" id="neg-pay">${payButtons()}</div>
            <div class="neg-total"><span>${mode === 'installment' ? '首付 / 总对价' : mode === 'equity' ? '换股对价' : '应付对价'}</span><b class="mono" id="neg-total">${fmtMoney(first)}${mode === 'installment' ? ` <span class="dim">/ ${fmtMoney(total)}</span>` : ''}</b></div>
            <div class="row neg-bid-row" style="gap:6px">
              <input id="neg-offer" type="number" min="0" step="1000000" placeholder="我方出价（总价，未含支付溢价）" style="flex:1;min-width:120px" />
              <button class="btn primary" id="neg-bid">出价</button>
            </div>
            <button class="btn" id="neg-accept" style="width:100%">接受当前要价</button>
            <div class="tiny dim" style="margin-top:6px">${esc(modeDef.desc)}</div>
          </div>
        </div>
        <details class="neg-rules"><summary>谈判规则 / 支付说明</summary>
          <div style="line-height:1.8;margin-top:5px">出价达到当前要价即刻成交；低于要价 80% 会被拒绝，多次低球会让对方离席。分期首付 35%，换股会稀释母公司股东；敌意收购只接受现金且不还价。</div>
        </details>
        <div class="neg-log" id="neg-log">${log.map((l) => `· ${esc(l)}`).join('<br/>')}</div>
        <div class="neg-actions">
          <button class="btn tiny ghost" id="neg-charm" ${(n.charmUsed || 0) >= 3 ? 'disabled' : ''}>公关游说（${n.charmUsed || 0}/3）</button>
          <button class="btn tiny ghost" id="neg-walk">放弃谈判</button>
          <span style="flex:1"></span>
          ${n.hostile
            ? '<span class="chip bad">敌意收购 · 不接受还价</span>'
            : '<button class="btn tiny ghost danger" id="neg-hostile">转为敌意收购（+35%）</button>'}
        </div>`;
    };
    const { mask, close } = modalShell(`收购谈判 · ${comp.name}`, '谈判桌', body(), 'modal-wide');
    const refresh = () => {
      const n = state.negotiation;
      if (!n) return;
      const askEl = mask.querySelector('#neg-ask');
      if (askEl) askEl.textContent = fmtMoney(n.ask);
      const defense = Math.round((n.defense || 0) * 100);
      const defBar = mask.querySelector('#neg-defense-bar');
      if (defBar) defBar.style.width = defense + '%';
      const defTxt = mask.querySelector('#neg-defense');
      if (defTxt) defTxt.textContent = defense + '%';
      const mood = Math.round(n.mood || 0);
      const moodBar = mask.querySelector('#neg-mood-bar');
      if (moodBar) moodBar.style.width = mood + '%';
      const moodEl = mask.querySelector('#neg-mood');
      if (moodEl) moodEl.textContent = `${mood}/100`;
      const total = dealPrice(n, n.payMode || 'cash');
      const first = (n.payMode || 'cash') === 'installment' ? Math.round(total * 0.35)
        : (n.payMode === 'equity' ? 0 : total);
      const totEl = mask.querySelector('#neg-total');
      if (totEl) totEl.innerHTML = fmtMoney(first) + ((n.payMode || 'cash') === 'installment' ? ` <span class="dim">/ ${fmtMoney(total)}</span>` : '');
      const payEl = mask.querySelector('#neg-pay');
      if (payEl) payEl.innerHTML = payButtons();
      const accBtn = mask.querySelector('#neg-accept');
      if (accBtn) {
        accBtn.textContent = `接受当前要价（${fmtMoney(first)}${(n.payMode || 'cash') === 'installment' ? ' 首付' : ''}）`;
        accBtn.disabled = (n.payMode || 'cash') !== 'equity' && state.company.cash < total;
      }
      const charmBtn = mask.querySelector('#neg-charm');
      if (charmBtn) {
        charmBtn.textContent = `公关游说（${n.charmUsed || 0}/3）`;
        charmBtn.disabled = (n.charmUsed || 0) >= 3;
      }
      const logEl = mask.querySelector('#neg-log');
      if (logEl) logEl.innerHTML = log.map((l) => `· ${esc(l)}`).join('<br/>');
    };
    const step = (offer) => {
      const r = negotiateOffer(state, offer);
      if (!r.ok) { opts.onToast?.(r.msg, 'bad'); return; }
      if (r.status === 'done') {
        opts.onToast?.(r.msg, 'good'); sfx('good');
        close(); render();
        return;
      }
      if (r.status === 'walked') { opts.onToast?.(r.msg, 'warn'); close(); render(); return; }
      log.push(offer === 'accept' ? '— 直接接受对方要价。' : `— 我方出价 ${fmtMoney(offer)}。${r.msg}`);
      refresh();
      opts.onToast?.(r.msg, r.status === 'counter' ? 'warn' : 'info');
    };
    mask.addEventListener('click', (e) => {
      const pay = e.target.closest('[data-pay]');
      if (pay) {
        const r = setPayMode(state, pay.dataset.pay);
        if (!r.ok) { opts.onToast?.(r.msg, 'bad'); return; }
        log.push(`— ${r.msg}`);
        refresh();
        return;
      }
      if (e.target.closest('#neg-bid')) { step(Number(mask.querySelector('#neg-offer').value)); return; }
      if (e.target.closest('#neg-accept')) { step('accept'); return; }
      if (e.target.closest('#neg-walk')) { walkAway(state); close(); render(); return; }
      if (e.target.closest('#neg-charm')) {
        const r = charmTarget(state);
        opts.onToast?.(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) { log.push(`— ${r.msg}`); refresh(); }
        return;
      }
      if (e.target.closest('#neg-hostile')) {
        const r = openNegotiation(state, comp.id, { hostile: true });
        if (!r.ok) { opts.onToast?.(r.msg, 'bad'); return; }
        close(); render(); openNegotiationModal(r.n);
      }
    });
  }

  function openDesigner(modelId) {
    const model = state.models.find((m) => m.id === modelId);
    if (!model) return;
    designer = renderDesigner(content, state, model, {
      onClose: () => { autoSave(state); designer.destroy(); designer = null; tab = 'product'; render(); },
      onSaved: (msg) => opts.onToast?.(msg, 'good'),
      onToast: opts.onToast,
    });
  }

  // 财务图表
  const origRender = render;
  render = function () {
    origRender();
    if (tab === 'finance') drawFinChart();
  };

  function drawFinChart() {
    const cv = content.querySelector('#fin-chart');
    if (!cv) return;
    const hist = historyRows(state, 24);
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    if (hist.length < 2) { ctx.fillStyle = '#66707f'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('推进时间后显示', w / 2, h / 2); return; }
    const max = Math.max(...hist.map((d) => Math.abs(d.net)), 1);
    const bw = (w - 10) / hist.length;
    hist.forEach((d, i) => {
      const bh = (Math.abs(d.net) / max) * (h - 24);
      const x = 5 + i * bw + bw * 0.15;
      ctx.fillStyle = d.net >= 0 ? 'rgba(55,201,165,.75)' : 'rgba(255,93,108,.75)';
      ctx.fillRect(x, d.net >= 0 ? h - 14 - bh : h - 14, bw * 0.7, bh);
    });
    ctx.strokeStyle = '#252e3b'; ctx.beginPath(); ctx.moveTo(0, h - 14); ctx.lineTo(w, h - 14); ctx.stroke();
  }

  paintTopbar();
  render();
  return app;
}

// ---------- 招聘池 ----------
function genPool(state, channel = 'social') {
  const count = channel === 'headhunter' ? 3 : channel === 'campus' ? 8 : 6;
  const pool = [];
  const campusSeason = [3, 4, 9, 10].includes(state.date.month + 1);
  for (let i = 0; i < count; i++) {
    const dept = DEPT_DEFS[Math.floor(Math.random() * DEPT_DEFS.length)].id;
    const roles = ROLE_BY_DEPT[dept];
    let skillMean = 45 + state.company.brand * 0.18 + (Math.random() - 0.5) * 16;
    let mul = 1;
    if (channel === 'campus') { skillMean = 32 + state.company.brand * 0.1 + (Math.random() - 0.5) * 10; mul = 0.6; if (!campusSeason && !state.recruitment?.campusEventMonths) skillMean -= 5; }
    else if (channel === 'headhunter') { skillMean = 68 + state.company.brand * 0.15 + (Math.random() - 0.5) * 12; mul = 1.35; }
    const emp = generateEmployee(state.date.year, { skillMean, deptId: dept, role: roles[Math.floor(Math.random() * roles.length)] });
    if (channel === 'campus') { emp.potential = Math.min(100, emp.potential + 12); emp.edu = '本科（应届）'; }
    emp.salary = Math.round(emp.salary * mul / 100) * 100;
    emp.expectSalary = Math.round(emp.expectSalary * mul / 100) * 100;
    pool.push(emp);
  }
  return pool;
}

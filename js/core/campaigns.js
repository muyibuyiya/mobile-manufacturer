// 区域营销活动 2.0（v1.9.0）
// 在“全球渠道预算”之外，增加按机型/市场/类型投放的短期 campaign。
// 营销趋势每 6 个月轮换；市场部人力与产品定位决定效率。
import { clamp } from './util.js';
import { MARKET_MAP, LINEUP_MAP } from '../data/world.js';
import { addLog } from './state.js';
import { perkMul } from './perks.js';

export const CAMPAIGN_TYPES = [
  { id: 'social', name: '社交种草', icon: '📱', desc: '短视频/社区口碑，适合主流与性价比机型', heat: 1.0, aware: 1.25, brand: 0.5, lineups: ['main', 'budget'], markets: ['cn', 'sea', 'in'] },
  { id: 'outdoor', name: '线下广告', icon: '🏙', desc: '地铁/商圈大牌，适合旗舰与高端市场', heat: 1.25, aware: 1.0, brand: 0.9, lineups: ['flagship', 'main'], markets: ['na', 'eu', 'jp', 'kr'] },
  { id: 'esports', name: '电竞赛事', icon: '🎮', desc: '赛事冠名与战队合作，适合性能/游戏机型', heat: 1.5, aware: 1.1, brand: 0.6, lineups: ['flagship', 'main'], markets: ['cn', 'kr', 'na', 'sea'] },
  { id: 'carrier', name: '运营商捆绑', icon: '📶', desc: '合约机与营业厅主推，适合中端走量', heat: 1.1, aware: 1.35, brand: 0.4, lineups: ['main', 'budget'], markets: ['cn', 'in', 'sea', 'af', 'sa'] },
  { id: 'review', name: '媒体评测', icon: '📰', desc: '权威媒体深度测评，适合影像/设计机型', heat: 0.9, aware: 0.9, brand: 1.35, lineups: ['flagship', 'main'], markets: ['na', 'eu', 'jp'] },
];

const TREND_CYCLE = ['social', 'outdoor', 'esports', 'carrier', 'review'];

export function ensureCampaigns(state) {
  if (!Array.isArray(state.campaigns)) state.campaigns = [];
  state.campaigns = state.campaigns.filter((c) => c && c.id && c.monthly > 0 && c.monthsLeft > 0);
  return state.campaigns;
}

export function currentTrend(state) {
  const monthIndex = state.date.year * 12 + state.date.month;
  const idx = Math.floor(monthIndex / 6) % TREND_CYCLE.length;
  return {
    id: TREND_CYCLE[idx],
    type: CAMPAIGN_TYPES.find((t) => t.id === TREND_CYCLE[idx]),
    monthsLeft: 6 - (monthIndex % 6),
    mul: 1.28,
  };
}

export function campaignFit(state, c) {
  const t = CAMPAIGN_TYPES.find((x) => x.id === c.type);
  const model = state.models.find((m) => m.id === c.modelId);
  if (!t || !model) return { fit: 0, reason: '无效活动' };
  let fit = 1;
  if (t.lineups.includes(model.lineup || 'main')) fit += 0.15;
  if (t.markets.includes(c.marketId)) fit += 0.1;
  const tr = currentTrend(state);
  if (tr.id === c.type) fit += 0.2;
  fit *= clamp(0.8 + (Number(c.monthly) || 0) / 8e6, 0.8, 1.35);
  return { fit: +fit.toFixed(2), trend: tr.id === c.type, type: t, model };
}

export function startCampaign(state, { modelId, marketId, type, monthly, months }) {
  ensureCampaigns(state);
  const model = state.models.find((m) => m.id === modelId);
  if (!model) return { ok: false, msg: '请选择投放机型' };
  if (model.released === false) return { ok: false, msg: '待发布机型还不能投放' };
  if (!MARKET_MAP[marketId]) return { ok: false, msg: '请选择市场' };
  if (!CAMPAIGN_TYPES.some((t) => t.id === type)) return { ok: false, msg: '请选择活动类型' };
  const m = Math.round(clamp(Number(monthly) || 0, 300000, 5000000));
  const n = Math.round(clamp(Number(months) || 3, 1, 12));
  if (state.company.cash < m) return { ok: false, msg: '现金不足，无法启动活动' };
  state.company.cash -= m;
  const c = {
    id: `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 4)}`,
    modelId, marketId, type, monthly: m, monthsLeft: n, monthsTotal: n,
    started: { ...state.date },
  };
  state.campaigns.push(c);
  const t = CAMPAIGN_TYPES.find((x) => x.id === type);
  addLog(state, 'market', `启动${t.name}：${model.name} · ${MARKET_MAP[marketId].name}，每月 ${(m / 1e4).toFixed(0)} 万，持续 ${n} 个月。`);
  return { ok: true, campaign: c };
}

export function cancelCampaign(state, id) {
  ensureCampaigns(state);
  const idx = state.campaigns.findIndex((c) => c.id === id);
  if (idx < 0) return { ok: false, msg: '找不到该活动' };
  const c = state.campaigns[idx];
  state.campaigns.splice(idx, 1);
  addLog(state, 'market', `提前结束一场营销活动，已投入费用不退。`);
  return { ok: true, campaign: c };
}

// 月度推进：返回品牌/认知加成；费用计入 report.marketing
export function stepCampaigns(state, report) {
  ensureCampaigns(state);
  let spend = 0, brandGain = 0, awareGain = 0;
  const ended = [];
  for (const c of state.campaigns) {
    const info = campaignFit(state, c);
    if (!info.fit) continue;
    const model = info.model;
    if (!model || model.status !== 'production' || model.released === false) continue;
    const t = info.type;
    const staff = 1 + clamp((state.employees || []).filter((e) => e.deptId === 'mkt').length * 0.02, 0, 0.2);
    const eff = info.fit * staff * (info.trend ? 1.25 : 1) * perkMul(state, 'marketing');
    spend += c.monthly;
    const heatGain = t.heat * (1.2 + c.monthly / 2e6) * eff * 0.45;
    model.heat = clamp((model.heat === undefined ? 100 : model.heat) + heatGain, 0, 120);
    const market = state.markets.find((m) => m.id === c.marketId);
    if (market) market.awareness = clamp((market.awareness || 0) + t.aware * eff * 0.35, 0, 100);
    brandGain += t.brand * eff * 0.22;
    awareGain += t.aware * eff * 0.18;
    c.monthsLeft -= 1;
    if (c.monthsLeft <= 0) ended.push(c);
  }
  for (const c of ended) {
    const idx = state.campaigns.indexOf(c);
    if (idx >= 0) state.campaigns.splice(idx, 1);
    addLog(state, 'market', `一场营销活动按计划结束。`);
  }
  report.campaignSpend = Math.round(spend);
  report.marketing = Math.round((report.marketing || 0) + spend);
  return { spend: Math.round(spend), brandGain: clamp(brandGain, 0, 4), awareGain: clamp(awareGain, 0, 6), ended: ended.length };
}

export function campaignSummary(state) {
  ensureCampaigns(state);
  return state.campaigns.map((c) => {
    const info = campaignFit(state, c);
    return {
      ...c,
      typeName: info.type?.name || c.type,
      typeIcon: info.type?.icon || '📣',
      modelName: info.model?.name || '—',
      marketName: MARKET_MAP[c.marketId]?.name || c.marketId,
      fit: info.fit,
      trend: info.trend,
    };
  });
}

export function bestCampaignTip(state, marketId) {
  const tr = currentTrend(state);
  const t = tr.type;
  return {
    trendName: t?.name || '—',
    trendIcon: t?.icon || '📣',
    monthsLeft: tr.monthsLeft,
    tip: t ? `当前趋势：${t.name}（效果 ×${tr.mul}），适合${t.lineups.map((x) => LINEUP_MAP[x]?.name || x).join(' / ')}机型。` : '',
  };
}
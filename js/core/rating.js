// 行业评价体系：不给结局，给一条"你在行业里算老几"的成长曲线。
// 六个维度加权出 0~100 的行业地位分，映射到八个称号段位；
// 同时给出按上个月销量的全球排名，让"经营感"有具体的参照物。
import { avgShare } from './sim.js';
import { clamp } from './util.js';

export const RATING_TIERS = [
  { min: 0,  name: '山寨作坊', icon: '🔧', desc: '贴牌代工起家，行业里还没人记得住你的名字。' },
  { min: 10, name: '新晋品牌', icon: '🌱', desc: '第一款产品卖出去了，评测媒体开始提到你。' },
  { min: 22, name: '区域玩家', icon: '📍', desc: '在本国市场站稳脚跟，有了回头客。' },
  { min: 35, name: '全国名牌', icon: '🏙️', desc: '国内家喻户晓，线下渠道愿意给你留黄金位置。' },
  { min: 50, name: '国际厂商', icon: '🌏', desc: '产品卖到海外，开始被国际大厂认真对待。' },
  { min: 65, name: '行业一线', icon: '⭐', desc: '发布会与苹果三星排在同一个月，没人敢忽视。' },
  { min: 80, name: '行业巨头', icon: '👑', desc: '供应链为你调整产能排期，你的定价就是行业锚点。' },
  { min: 92, name: '时代标杆', icon: '🚀', desc: '定义了这个时代的手机该长什么样。' },
];

function tierOf(score) {
  let t = RATING_TIERS[0];
  for (const x of RATING_TIERS) if (score >= x.min) t = x;
  return t;
}

// 下一档位距离（用于进度条）
function nextTierOf(score) {
  return RATING_TIERS.find((t) => t.min > score) || null;
}

/**
 * 行业地位评价（每月调用一次也够快，页面渲染时实时算）。
 * 返回 { score, tier, next, nextGap, dims, rank, rankTotal }
 */
export function industryRating(state) {
  // ---- 规模（35 分）：全球加权份额，0.15% 起步给分，15% 封顶 ----
  const share = avgShare(state);
  const scale = clamp(share / 0.15, 0, 1) * 35;

  // ---- 财务（15 分）：近 12 月营收，对数尺度，1 亿起步 500 亿封顶 ----
  const rev12 = (state.history || []).slice(-12).reduce((a, h) => a + (h.revenue || 0), 0);
  const finance = clamp(Math.log10(Math.max(rev12, 1) / 1e8) / Math.log10(5000), 0, 1) * 15;

  // ---- 技术（15 分）：解锁科技 + 自研部门等级 + OS 装机 ----
  const techPts = (state.tech?.unlocked?.length || 0) / Math.max(state.tech?.total || 40, 30);
  const divLv = Object.values(state.divisions || {}).reduce((a, d) => a + (d.level || 0), 0) / 20;
  const osPts = Math.min((state.osPop?.totalInstall || 0) / 5e8, 1);
  const tech = clamp(techPts * 0.5 + divLv * 0.3 + osPts * 0.2, 0, 1) * 15;

  // ---- 品牌（15 分）----
  const brand = clamp((state.company.brand || 0) / 95, 0, 1) * 15;

  // ---- 产品（12 分）：累计销量对数（10 万起步 5 亿封顶）----
  const sold = (state.models || []).reduce((a, m) => a + (m.sold || 0), 0);
  const product = clamp(Math.log10(Math.max(sold, 1) / 1e5) / Math.log10(5000), 0, 1) * 12;

  // ---- 口碑（8 分）：用户评分与声誉 ----
  const fb = state.feedback?.user || 50;
  const rep = clamp(((fb - 40) / 55) * 0.6 + ((state.company.reputation - 30) / 65) * 0.4, 0, 1) * 8;

  const score = Math.round(clamp(scale + finance + tech + brand + product + rep, 0, 100));

  // ---- 全球排名：按上月销量（玩家 vs 竞品） ----
  const myUnits = (state.models || []).reduce((a, m) => a + (m.lastSold || 0), 0);
  const rivals = (state.competitors || []).filter((c) => !c.sub);
  const rankTotal = rivals.length + 1;
  const rank = 1 + rivals.filter((c) => (c.lastSold || 0) > myUnits).length;

  const tier = tierOf(score);
  const next = nextTierOf(score);
  return {
    score,
    tier,
    next,
    nextGap: next ? next.min - score : 0,
    dims: [
      { id: 'scale', name: '市场规模', pts: scale, max: 35, hint: `全球份额 ${(share * 100).toFixed(2)}%` },
      { id: 'finance', name: '营收体量', pts: finance, max: 15, hint: `近 12 月营收 ${Math.round(rev12 / 1e8)} 亿` },
      { id: 'tech', name: '技术储备', pts: tech, max: 15, hint: `科技 ${(state.tech?.unlocked?.length || 0)} 项 · 部门 Lv.${Object.values(state.divisions || {}).reduce((a, d) => a + (d.level || 0), 0)}` },
      { id: 'brand', name: '品牌力', pts: brand, max: 15, hint: `品牌 ${(state.company.brand || 0).toFixed(1)}/95` },
      { id: 'product', name: '累计销量', pts: product, max: 12, hint: `${Math.round(sold / 1e4)} 万台` },
      { id: 'rep', name: '用户口碑', pts: rep, max: 8, hint: fb ? `评分 ${fb}` : '尚无反馈' },
    ],
    rank,
    rankTotal,
  };
}

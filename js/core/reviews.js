// 产品评价：用户评分 / 媒体评测 / 故障率 / 退货率 / 玩家评论
// 这些数字不是装饰——故障率决定售后成本与退货支出，口碑又回灌到下一代产品。
import { clamp } from './util.js';
import { derive, eraBaseline, eraRel, packageScore } from './design.js';
import { MARKET_MAP, expectedPrice } from '../data/world.js';
import { staffPower } from './state.js';
import { fQa } from './org.js';
import { warrantyRatingAdd, returnsCutOf } from './aftermarket.js';
import { modelCommentTags, pickComments } from '../data/reviews-text.js';
import { perkMul } from './perks.js';

// 故障率：质量投入、产线水平、质量部强度共同决定
export function defectRate(state, model) {
  const qaPower = staffPower(state, 'qa');
  const base = 0.03 + Math.max(0, 72 - (model.quality ?? 65)) * 0.0016;
  const improve = clamp(qaPower * 0.0022, 0, 0.02);
  return clamp((base - improve) * fQa(state) * perkMul(state, 'defect'), 0.0015, 0.16);
}

const lg = (x) => Math.log2(Math.max(x, 0.35));

export function computeReview(state, model) {
  const year = state.date.year;
  const d = derive(model.design, year);
  const base = eraBaseline(year);
  // 定价贵不贵，要跟"这个市场愿意出多少钱"比，而不是跟全球基准价比
  const cnWealth = MARKET_MAP.cn?.wealth ?? 0.62;
  const exp = expectedPrice(year) * (0.55 + cnWealth * 0.9);
  const price = model.price?.cn || Math.round(exp);
  const fair = price / Math.max(exp, 1);

  // 四维都换算成"同代倍率"，再做加权几何平均 —— 早期年代与晚期年代用同一把尺子
  const rDsn = eraRel(d.designScore, base.designScore);
  const rPerf = eraRel(d.perf, base.perf);
  const rCam = eraRel(d.camera, base.camera);
  const rBat = eraRel(d.battery, base.battery);

  const defect = defectRate(state, model);
  // 退货率低于故障率：不是每台故障机都会被退回，但价格虚高会额外推高退货
  // 保修政策越慷慨，用户越倾向维修而非退货
  const returns = clamp((defect * 1.5 + Math.max(0, fair - 1.15) * 0.05) * (1 - returnsCutOf(state)), 0.001, 0.16);

  // 媒体更看设计与性能，用户更看整体体验与价格
  const mediaRaw = 0.34 * lg(rDsn) + 0.30 * lg(rPerf) + 0.20 * lg(rCam) + 0.16 * lg(rBat);
  const userRaw = 0.28 * lg(rDsn) + 0.28 * lg(rPerf) + 0.20 * lg(rCam) + 0.24 * lg(rBat);
  const q = model.quality ?? 65;

  const media = clamp(
    50 + 44 * mediaRaw + (q - 65) * 0.22 - Math.max(0, fair - 1.35) * 14,
    5, 98,
  );
  const user = clamp(
    52 + 40 * userRaw + (q - 65) * 0.45 + warrantyRatingAdd(state)
    - Math.max(0, fair - 1) * 18 - defect * 110 + (state.company.reputation - 45) * 0.12 + (packageScore(model.design) - 2) * 0.5,
    5, 98,
  );
  return {
    user: +user.toFixed(1),
    media: +media.toFixed(1),
    defect: +defect.toFixed(4),
    returns: +returns.toFixed(4),
    satisfaction: Math.round(clamp(user * 0.8 + (100 - defect * 1000) * 0.2, 0, 100)),
  };
}

// 玩家评论：按机型评分/定价/特征每月抽几条（存到 model.comments）
export function refreshComments(state, model, review) {
  const price = model.price?.cn || 2000;
  const year = state.date.year;
  const d = derive(model.design, year);
  const exp = expectedPrice(year) * (0.55 + (MARKET_MAP.cn?.wealth ?? 0.62) * 0.9);
  const tags = modelCommentTags(model, model.design);
  model.comments = pickComments(review.user, price / Math.max(exp, 1), tags, 3);
  model.commentsDate = { ...state.date };
}

// 每月刷新一次评价；退货会产生真实现金支出
export function stepReviews(state, report) {
  let refund = 0;
  let defectUnits = 0;
  let soldTotal = 0;
  let userSum = 0, userW = 0;
  for (const p of state.models) {
    if (p.status !== 'production') continue;
    const r = computeReview(state, p);
    p.review = { ...r, date: { ...state.date } };
    p.rating = Math.round(r.user * 0.6 + r.media * 0.4);
    // 有销量的机型刷新玩家评论（卖得好评论区也更热闹）
    if (p.lastSold > 0 || !p.comments) refreshComments(state, p, r);
    if (p.lastSold > 0) {
      const price = p.price?.cn || 2000;
      refund += p.lastSold * price * r.returns * 0.45;
      defectUnits += p.lastSold * r.returns;
      soldTotal += p.lastSold;
      userSum += r.user * p.lastSold;
      userW += p.lastSold;
    }
  }
  const avgDefect = soldTotal > 0 ? defectUnits / soldTotal : 0;
  report.refunds = Math.round(refund);
  report.returns = +(avgDefect * 100).toFixed(2);
  report.avgUserScore = userW > 0 ? +(userSum / userW).toFixed(1) : null;
  // 存一份"上代反馈"，设计新产品时作为参考基线
  if (userW > 0) {
    state.feedback = {
      user: +(userSum / userW).toFixed(1),
      defect: +(avgDefect * 100).toFixed(2),
      date: { ...state.date },
    };
  }
  return report;
}

// 口碑对品牌的影响系数（0.9 ~ 1.1）
export function wordOfMouth(state) {
  const f = state.feedback;
  if (!f || !f.user) return 1;
  return clamp(1 + (f.user - 52) / 320, 0.9, 1.1);
}

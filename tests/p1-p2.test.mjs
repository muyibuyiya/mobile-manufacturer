// P1/P2 核心单测：门店 / 区域营销 / OS 主题
import { createGame } from '../js/core/state.js';
import { openStore, upgradeStore, closeStore, storeStats, storeSalesMul, stepStores } from '../js/core/stores.js';
import { startCampaign, stepCampaigns, cancelCampaign, currentTrend } from '../js/core/campaigns.js';
import { themeScore, selectTheme, themeBonus } from '../js/core/themes.js';
import { addPerkXp, perkSummary, perkChoices, choosePerk } from '../js/core/perks.js';
import { loanSummary, loanOffers, takeLoan, repayLoan, stepLoans } from '../js/core/loans.js';

let bad = 0;
const check = (name, ok, detail = '') => {
  if (!ok) bad += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};
const s = createGame({ mode: 'sandbox', year: 2020, cash: 2e10 });
s.company.cash = 2e10;

// 门店
const c0 = s.company.cash;
const r1 = openStore(s, 'cn');
check('可以开店', r1.ok === true);
check('开店扣现金', s.company.cash < c0, `${c0} -> ${s.company.cash}`);
check('门店数量 1', storeStats(s, 'cn').count === 1);
check('门店提升本地销量系数', storeSalesMul(s, 'cn') > 1);
const r2 = upgradeStore(s, 'cn', r1.store.id);
check('门店可升级', r2.ok === true && r2.store.level === 2);
const beforeUpkeep = s.company.cash;
const rep = {};
const upkeep = stepStores(s, rep);
check('门店维护费入账', upkeep > 0 && rep.stores === upkeep, `upkeep=${upkeep}`);
const r3 = closeStore(s, 'cn', r1.store.id);
check('关店回收资金', r3.ok === true && r3.refund > 0);
check('关店后数量 0', storeStats(s, 'cn').count === 0);

// 区域营销
const model = { id: 'mkt1', name: '测试机', status: 'production', released: true, lineup: 'main', heat: 55, price: { cn: 2000 } };
s.models.push(model);
s.company.cash = 1e9;
const cr = startCampaign(s, { modelId: model.id, marketId: 'cn', type: 'social', monthly: 1000000, months: 3 });
check('可以启动营销活动', cr.ok === true && s.campaigns.length === 1);
check('启动扣首月预算', s.company.cash === 999000000, String(s.company.cash));
const heat0 = model.heat;
const mrep = {};
const eff = stepCampaigns(s, mrep);
check('营销活动提升热度', model.heat > heat0, `${heat0} -> ${model.heat}`);
check('营销费用计入报表', mrep.marketing >= 1000000 && eff.spend >= 1000000);
check('活动剩余月数递减', s.campaigns[0]?.monthsLeft === 2, String(s.campaigns[0]?.monthsLeft));
check('营销趋势存在', !!currentTrend(s).type);
const can = cancelCampaign(s, cr.campaign.id);
check('可以提前结束活动', can.ok === true && s.campaigns.length === 0);

// OS 主题
s.uiDesigns = [{
  uid: 'u_theme', name: '深海主题', wallpaper: 'data:image/jpeg;base64,xx', wallColor: '#0a1020',
  lockWallpaper: 'data:image/jpeg;base64,yy', lockWallColor: '#141c33',
  lockShowTime: true, lockShowDate: true, lockShowNotif: true, navStyle: 'gesture', dockCount: 4, cols: 4, rows: 5,
}];
const score = themeScore(s.uiDesigns[0]);
check('主题评分有效', score > 50 && score <= 100, String(score));
const sel = selectTheme(s, 'u_theme');
check('可设为 OS 主题', sel.ok === true && s.osThemeUid === 'u_theme');
check('主题提供流行度加成', themeBonus(s).popGrowth > 0);

// Perk
addPerkXp(s, 'tech', 999);
const techTrack = perkSummary(s).find((t) => t.id === 'tech');
check('Perk 可升级并待选择', techTrack.pending === true && techTrack.level === 1);
const opts = perkChoices(s, 'tech');
check('Perk 二选一', opts.length === 2, String(opts.length));
const chosen = choosePerk(s, 'tech', opts[0].id);
check('Perk 可选择生效', chosen.ok === true);
check('Perk 选择后关闭待选', perkSummary(s).find((t) => t.id === 'tech').pending === false);

// 贷款 2.0
const beforeLoan = s.company.cash;
const offer = loanOffers(s)[0];
const ln = takeLoan(s, offer.id);
check('可申请贷款', ln.ok === true && s.loans.length >= 1);
check('贷款放款并计入负债', s.company.cash > beforeLoan && s.company.debt >= offer.amount);
const rep2 = {};
const interest2 = stepLoans(s, rep2);
check('贷款按月计息', interest2 > 0 && rep2.interest === interest2);
const paid = repayLoan(s, ln.loan.id, ln.loan.balance);
check('可提前全额还款', paid.ok === true && s.loans.every((l) => l.id !== ln.loan.id));
check('还清后负债下降', s.company.debt < offer.amount, String(s.company.debt));
check('信用分存在', loanSummary(s).score >= 300);

console.log(bad ? `\n${bad} failed` : '\nALL PASS');
process.exit(bad ? 1 : 0);
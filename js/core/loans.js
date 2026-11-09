// 银行贷款 2.0（v1.10.0）
// 额度/利率/期限 + 信用分 + 灵活还款 + 逾期；替代单一固定利率负债。
import { clamp } from './util.js';
import { addLog } from './state.js';
import { annualRevenue as revenueOf } from './capital.js';
import { perkMul } from './perks.js';

const MONTH0 = (d) => (d?.year || 0) * 12 + (d?.month || 0);

export function ensureLoans(state) {
  const hadBook = Array.isArray(state.loans);
  if (!hadBook) state.loans = [];
  if (!state.credit || typeof state.credit !== 'object') state.credit = { score: 600, history: [] };
  if (!Number.isFinite(Number(state.credit.score))) state.credit.score = 600;
  state.loans = state.loans.filter((l) => l && Number(l.balance) > 0);
  // 旧档负债没有明细：只在首次建立贷款簿时补一笔 24 个月、7.5% 的历史贷款
  const debt = Math.max(0, Number(state.company.debt) || 0);
  const booked = state.loans.reduce((a, l) => a + Number(l.balance || 0), 0);
  if (!hadBook && debt > booked + 1) {
    state.loans.push({
      id: 'ln_legacy', bank: '历史贷款', principal: debt - booked, balance: debt - booked,
      rate: 0.075, months: 24, start: { ...state.date }, due: MONTH0(state.date) + 24, overdue: 0,
    });
  }
  return state.loans;
}

export function loanDebt(state) {
  return ensureLoans(state).reduce((a, l) => a + Number(l.balance || 0), 0);
}

export function creditLimit(state) {
  const rev = Math.max(0, revenueOf(state));
  const valuation = Math.max(1e7, Number(state.company.valuation) || 1e7);
  return Math.round(Math.max(5e6, rev * 0.55 + valuation * 0.12) * perkMul(state, 'creditLimit'));
}

export function creditRate(state) {
  ensureLoans(state);
  const score = state.credit?.score || 600;
  return clamp(0.12 - (score - 600) / 100 * 0.012, 0.045, 0.2);
}

export function loanOffers(state) {
  ensureLoans(state);
  const base = creditRate(state);
  const limit = creditLimit(state);
  return [
    { id: 'short', name: '短期周转', amount: Math.round(limit * 0.3), months: 12, rate: +(base + 0.01).toFixed(3), desc: '额度小、审批快，适合发工资/备料' },
    { id: 'mid', name: '中期扩张', amount: Math.round(limit * 0.6), months: 24, rate: +base.toFixed(3), desc: '开店/营销/产线，平衡成本与期限' },
    { id: 'long', name: '长期项目', amount: Math.round(limit * 1.0), months: 36, rate: +(base - 0.005).toFixed(3), desc: '自研/建厂，期限长但总额度最高' },
  ];
}

export function takeLoan(state, offerId) {
  ensureLoans(state);
  const offer = loanOffers(state).find((o) => o.id === offerId);
  if (!offer) return { ok: false, msg: '无效贷款方案' };
  if (!Number.isFinite(offer.amount) || offer.amount <= 0) return { ok: false, msg: '当前额度不足' };
  const loan = {
    id: `ln_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 4)}`,
    bank: offer.name, principal: offer.amount, balance: offer.amount, rate: offer.rate,
    months: offer.months, start: { ...state.date }, due: MONTH0(state.date) + offer.months, overdue: 0,
  };
  state.loans.push(loan);
  state.company.cash += offer.amount;
  state.company.debt = loanDebt(state);
  state.credit.score = clamp((state.credit.score || 600) - 4, 300, 850);
  addLog(state, 'fin', `银行放款 ${(offer.amount / 1e4).toFixed(0)} 万元，${offer.months} 个月，年化 ${(offer.rate * 100).toFixed(1)}%。`);
  return { ok: true, loan, offer };
}

export function repayLoan(state, id, amount) {
  ensureLoans(state);
  const loan = state.loans.find((l) => l.id === id);
  if (!loan) return { ok: false, msg: '找不到该笔贷款' };
  const pay = Math.min(Number(amount) || loan.balance, loan.balance, state.company.cash);
  if (pay <= 0) return { ok: false, msg: '没有可还金额或现金不足' };
  state.company.cash -= pay;
  loan.balance = Math.max(0, loan.balance - pay);
  state.company.debt = loanDebt(state);
  if (loan.balance <= 0) {
    state.loans = state.loans.filter((l) => l.id !== id);
    state.credit.score = clamp((state.credit.score || 600) + 10, 300, 850);
    addLog(state, 'fin', `结清贷款「${loan.bank}」，信用分提升。`);
  } else {
    addLog(state, 'fin', `提前还款 ${(pay / 1e4).toFixed(0)} 万元，剩余 ${(loan.balance / 1e4).toFixed(0)} 万元。`);
  }
  return { ok: true, paid: pay, remaining: loan.balance };
}

export function addEmergencyLoan(state, amount) {
  ensureLoans(state);
  const loan = {
    id: `ln_em_${Date.now().toString(36)}`, bank: '紧急透支', principal: amount, balance: amount,
    rate: 0.18, months: 6, start: { ...state.date }, due: MONTH0(state.date) + 6, overdue: 0,
  };
  state.loans.push(loan);
  state.company.cash += amount;
  state.company.debt = loanDebt(state);
  state.credit.score = clamp((state.credit.score || 600) - 8, 300, 850);
  addLog(state, 'fin', `现金不足，银行紧急透支 ${(amount / 1e4).toFixed(0)} 万元，年化 18%。`);
  return loan;
}

export function stepLoans(state, report) {
  ensureLoans(state);
  const now = MONTH0(state.date);
  let interest = 0;
  for (const loan of state.loans) {
    interest += loan.balance * loan.rate / 12;
    if (now > loan.due && loan.balance > 0) {
      if (!loan.overdue) {
        loan.overdue = 0;
        addLog(state, 'warn', `贷款「${loan.bank}」已到期，未还金额 ${(loan.balance / 1e4).toFixed(0)} 万元。`);
      }
      loan.overdue = (loan.overdue || 0) + 1;
      if (loan.overdue === 1) {
        state.credit.score = clamp((state.credit.score || 600) - 25, 300, 850);
        report.notes.push(`「${loan.bank}」逾期，信用分下降，后续借款利率上升。`);
      }
      if (loan.overdue % 3 === 0) {
        const penalty = Math.round(loan.balance * 0.02);
        loan.balance += penalty;
        state.company.debt = loanDebt(state);
        report.notes.push(`逾期罚息 ${(penalty / 1e4).toFixed(0)} 万元计入本金。`);
      }
    }
  }
  report.interest = Math.round(interest);
  report.debt = loanDebt(state);
  return Math.round(interest);
}

export function loanSummary(state) {
  const list = ensureLoans(state);
  return {
    score: state.credit?.score || 600,
    rate: creditRate(state),
    limit: creditLimit(state),
    debt: loanDebt(state),
    loans: list.map((l) => ({
      ...l,
      dueText: `${Math.floor(l.due / 12)}年${l.due % 12 + 1}月`,
      overdue: Math.max(0, MONTH0(state.date) - l.due),
    })),
  };
}
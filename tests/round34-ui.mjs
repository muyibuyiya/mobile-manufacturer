// 第 34 轮 UI 回归：历史降采样 / 竞品招牌财报 / 产品状态筛选 / 存档占用与保存反馈
// 前置：npm start（8124）+ 无头 Chrome（CDP 9222）
const BASE = 'http://127.0.0.1:9222';
const URL = process.argv[2] || 'http://127.0.0.1:8124/index.html';
const OUT = process.argv[3] || 'tests';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tabs = await (await fetch(BASE + '/json/list')).json();
  const tab = tabs.find((t) => t.type === 'page');
  if (!tab) throw new Error('无可用 CDP 页面：请先启动无头 Chrome（--remote-debugging-port=9222）');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  let pass = 0, fail = 0;
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('[net] ' + m.params.entry.text);
  };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL }); await sleep(1500);

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) errors.push('eval: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r.result?.data) {
      const fs = await import('node:fs');
      fs.writeFileSync(`${OUT}-${name}.png`, Buffer.from(r.result.data, 'base64'));
    }
  };
  const check = (name, ok, detail = '') => {
    if (ok) pass++; else fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  };

  await ev('window.confirm = () => true');
  await ev('localStorage.clear()');
  await send('Page.reload'); await sleep(1500);
  await ev(`[...document.querySelectorAll('.menu-item')].find(x => x.textContent.includes('沙盒'))?.click()`);
  await sleep(400);
  await ev(`document.querySelector('#start')?.click()`); await sleep(1600);
  check('沙盒开局成功', await ev(`!!document.querySelector('.game')`));
  errors.length = 0;

  // 1. 产品状态筛选（r34：未发布不销售 / 自动退市口径）
  await ev(`document.querySelector('[data-tab=product]')?.click()`); await sleep(400);
  const filters = await ev(`[...document.querySelectorAll('[data-act=prod-filter]')].map(b => b.dataset.v)`);
  check('产品页有 4 档状态筛选', (filters || []).length >= 4, JSON.stringify(filters));
  check('筛选含「待发布 / 在售 / 已退市」', ['pending', 'sale', 'out'].every((k) => (filters || []).includes(k)));
  const outClick = await ev(`(() => { const b = document.querySelector('[data-act=prod-filter][data-v=out]'); if (!b) return false; b.click(); return true; })()`);
  await sleep(350);
  check('「已退市」筛选可切换', outClick === true && (await ev(`!!document.querySelector('.page-head')`)));
  await ev(`document.querySelector('[data-act=prod-filter][data-v=all]')?.click()`); await sleep(300);
  await shot('01-products-filter');

  // 2. 竞品财报：招牌能力 + 近 12 月销量（r34：竞品招牌 / 历史降采样）
  // 竞品按史实年份入场，1980 沙盒开局只有 1 家在场，因此这里断言「至少 1 家」而非全部 16 家
  await ev(`document.querySelector('[data-tab=rivals]')?.click()`); await sleep(500);
  const detailBtns = await ev(`document.querySelectorAll('[data-act=comp-detail]').length`);
  check('竞品页有财报入口', detailBtns >= 1, `n=${detailBtns}`);
  await ev(`document.querySelector('[data-act=comp-detail]')?.click()`); await sleep(400);
  const modalText = await ev(`document.querySelector('.modal-mask .modal')?.textContent || ''`);
  check('财报弹窗含「招牌能力」', modalText.includes('招牌能力'));
  check('财报弹窗含近 12 月销量', modalText.includes('近 12 月销量'));
  check('财报弹窗含库存与产能', modalText.includes('库存') && modalText.includes('产能'));
  await shot('02-rival-financial');
  await ev(`document.querySelector('.modal-mask [data-close]')?.click()`); await sleep(250);

  // 3. 财务页现金流趋势（r34：历史降采样后仍能渲染 24 月区间）
  await ev(`document.querySelector('[data-tab=finance]')?.click()`); await sleep(400);
  check('财务页现金流趋势卡片存在', await ev(`document.body.textContent.includes('现金流趋势')`));
  check('趋势区有图表画布', await ev(`!!document.querySelector('#fin-chart')`));
  await shot('03-finance');

  // 5. 月度推进不整页重建：同页刷新复用 DOM 节点，输入焦点与滚动才不会被吞掉
  await ev(`document.querySelector('[data-tab=overview]')?.click()`); await sleep(350);
  const dateOf = `([...document.querySelectorAll('.stat-inline')].find(x => x.textContent.includes('日期'))?.querySelector('.v')?.textContent || '')`;
  const dateBefore = await ev(dateOf);
  await ev(`(() => { const ph = document.querySelector('.page-head'); if (ph) ph.__morphMark = 'keep'; document.querySelector('[data-act=advance]')?.click(); return true; })()`);
  await sleep(600);
  const dateAfter = await ev(dateOf);
  check('推进后页面节点被复用', await ev(`document.querySelector('.page-head')?.__morphMark === 'keep'`));
  check('推进后日期已刷新', !!dateAfter && dateBefore !== dateAfter, `${dateBefore} -> ${dateAfter}`);

  // 4. 存档占用提示 + 保存反馈（本次容量兜底）
  await ev(`document.querySelector('[data-act=open-gamemenu]')?.click()`); await sleep(300);
  await ev(`document.querySelector('[data-gm=save]')?.click()`); await sleep(400);
  const savedText = await ev(`document.querySelector('.modal-mask .modal')?.textContent || ''`);
  check('存档弹窗显示占用体积', /本机存档占用\s*[\d.]+ MB/.test(savedText), savedText.slice(0, 40));
  await ev(`document.querySelector('[data-sp=save]')?.click()`); await sleep(500);
  check('保存成功后提示「已保存」', await ev(`document.querySelector('#toast-stack')?.textContent.includes('已保存')`));
  check('保存后槽位不再为空', await ev(`document.body.textContent.includes('款机型')`));
  await shot('04-slots');

  console.log(`\n=== round34-ui: ${pass} passed, ${fail} failed ===`);
  const errs = errors.filter((e) => !/favicon/.test(e));
  console.log('errors:', errs.length ? errs.slice(0, 5) : 'none');
  ws.close();
  process.exit(fail || errs.length ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
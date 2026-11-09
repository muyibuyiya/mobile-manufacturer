// P1 回归：全球门店 / 区域营销活动 / 发布会 PR 2.0
const BASE = 'http://127.0.0.1:9222';
const URL = process.argv[2] || 'http://127.0.0.1:8124/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tabs = await (await fetch(BASE + '/json/list')).json();
  const tab = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  let pass = 0, fail = 0;
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL }); await sleep(1400);
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) errors.push('eval: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  };
  const check = (name, ok, detail = '') => {
    if (ok) pass++; else fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  };
  await ev('localStorage.clear()'); await send('Page.reload'); await sleep(1400);
  await ev(`[...document.querySelectorAll('.menu-item')].find(x => x.textContent.includes('沙盒'))?.click()`);
  await sleep(400);
  await ev(`document.querySelector('#start')?.click()`); await sleep(1500);
  await ev(`document.querySelector('[data-tab=market]')?.click()`); await sleep(400);
  errors.length = 0;

  check('市场页有门店网络', await ev(`document.body.textContent.includes('全球门店网络')`));
  check('市场页有区域营销活动', await ev(`document.body.textContent.includes('区域营销活动')`));
  await ev(`document.querySelector('[data-tab=company]')?.click()`); await sleep(250);
  check('组织页有经营成长 Perk', await ev(`document.body.textContent.includes('经营成长') && document.body.textContent.includes('影响力与支配')`));
  await ev(`document.querySelector('[data-tab=finance]')?.click()`); await sleep(250);
  await ev(`document.querySelector('[data-act="loan-modal"]')?.click()`); await sleep(250);
  check('银行贷款弹窗有 3 档方案', await ev(`document.querySelectorAll('[data-act="loan-take"]').length === 3`));
  await ev(`document.querySelector('.modal-mask [data-close]')?.click()`); await sleep(200);
  await ev(`document.querySelector('[data-tab=market]')?.click()`); await sleep(250);

  // 开店 → 升级 → 关店
  const open = await ev(`(() => { const b = document.querySelector('[data-act="store-open"]'); if (!b) return ''; const before = b.closest('.org-exec')?.textContent || ''; b.click(); return before; })()`);
  await sleep(350);
  const afterOpen = await ev(`document.querySelector('[data-act="store-open"]')?.closest('.org-exec')?.textContent || ''`);
  check('门店可开设', /1\/3/.test(afterOpen), open.slice(0, 30));
  const up = await ev(`(() => { const b = document.querySelector('[data-act="store-upgrade"]'); if (!b) return false; b.click(); return true; })()`);
  await sleep(350);
  const afterUp = await ev(`document.body.textContent.includes('旗舰店 Lv2')`);
  check('门店可升级', up === true && afterUp === true);
  const close = await ev(`(() => { const b = document.querySelector('[data-act="store-close"]'); if (!b) return false; b.click(); return true; })()`);
  await sleep(350);
  const afterClose = await ev(`document.querySelector('[data-act="store-open"]')?.closest('.org-exec')?.textContent || ''`);
  check('门店可关闭', close === true && /0\/3/.test(afterClose));

  // 发布会风格 + 记者问答
  await ev(`document.querySelector('[data-tab=product]')?.click()`); await sleep(300);
  await ev(`document.querySelector('[data-act="launch"]')?.click()`); await sleep(400);
  await ev(`document.querySelector('[data-tab=market]')?.click()`); await sleep(300);
  await ev(`document.querySelector('[data-act="open-stage"]')?.click()`); await sleep(1300);
  await ev(`document.querySelector('#stage-start')?.click()`); await sleep(250);
  const styleN = await ev(`document.querySelectorAll('[data-style]').length`);
  await ev(`document.querySelector('[data-style]')?.click()`); await sleep(250);
  await ev(`document.querySelector('[data-guess]')?.click()`); await sleep(250);
  await ev(`document.querySelector('[data-pitch]')?.click()`); await sleep(250);
  const pressN = await ev(`document.querySelectorAll('[data-press]').length`);
  await ev(`document.querySelector('[data-press]')?.click()`); await sleep(400);
  const result = await ev(`document.querySelector('.stage-result')?.textContent || ''`);
  check('发布会风格可选择', styleN === 4, String(styleN));
  check('记者问答可选择', pressN === 3 && result.includes('叙事风格'), String(pressN));
  await ev(`document.querySelector('#stage-done')?.click()`); await sleep(350);
  check('发布会后生成科技圈动态', await ev(`document.body.textContent.includes('科技圈')`));

  // 发布后在售机型可启动区域营销活动并提前结束
  const start = await ev(`(() => {
    const b = document.querySelector('[data-act="campaign-start"]'); if (!b || b.disabled) return '';
    const m = document.querySelector('[data-camp="model"]'); if (!m || !m.value) return '';
    b.click(); return m.value;
  })()`);
  await sleep(400);
  const active = await ev(`document.querySelector('[data-act="campaign-cancel"]') !== null`);
  check('区域营销活动可启动', !!start && active === true, start);
  await ev(`document.querySelector('[data-act="campaign-cancel"]')?.click()`); await sleep(350);
  check('区域营销活动可提前结束', await ev(`document.querySelector('[data-act="campaign-cancel"]') === null`));

  check('无运行时报错', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  ws.close();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
// 第 33 轮 UI 冒烟：员工档案 / 竞品财报 / 收购谈判支付方式 / 子品牌发新品 / 发布会 mini-game
const BASE = 'http://127.0.0.1:9222';
const URL = process.argv[2] || 'http://127.0.0.1:8124/index.html';
const PREFIX = process.argv[3] || '.tmp/r33';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tabs = await (await fetch(BASE + '/json/list')).json();
  const tab = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const errors = [];
  let pass = 0, fail = 0;

  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    }
  };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await sleep(1500);
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) errors.push('eval: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  };
  const shot = async (n) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r.result?.data) (await import('node:fs')).writeFileSync(`${PREFIX}-${n}.png`, Buffer.from(r.result.data, 'base64'));
  };
  const check = (name, ok, detail = '') => {
    if (ok) pass += 1; else fail += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };
  const closeModal = async () => {
    await ev("document.querySelector('.modal-mask [data-close]')?.click()");
    await sleep(250);
  };

  await ev('localStorage.clear()');
  await send('Page.reload');
  await sleep(1400);
  errors.length = 0;

  // 沙盒开局（自带一台在售机型）
  await ev("[...document.querySelectorAll('.menu-item')].find(x=>x.textContent.includes('沙盒')).click()");
  await sleep(400);
  await shot('00-config');
  await ev("document.querySelector('#start').click()");
  await sleep(1200);

  // 1. 员工档案
  await ev("document.querySelector('[data-tab=company]').click()");
  await sleep(300);
  const empBtns = await ev("document.querySelectorAll('[data-act=open-emp]').length");
  check('名册有「详情」入口', empBtns > 0, `按钮 ${empBtns} 个`);
  await ev("document.querySelector('[data-act=open-emp]').click()");
  await sleep(300);
  check('员工档案弹窗打开', !!(await ev("document.querySelector('#emp-raise')")));
  check('档案显示流失风险', (await ev("document.body.textContent.includes('月流失风险')")) === true);
  await shot('01-employee');
  await closeModal();

  // 2. 竞品财报
  await ev("document.querySelector('[data-tab=rivals]').click()");
  await sleep(300);
  check('竞品卡有「财报」按钮', (await ev("document.querySelectorAll('[data-act=comp-detail]').length")) > 0);
  await ev("document.querySelector('[data-act=comp-detail]').click()");
  await sleep(300);
  check('财报弹窗含产能与猎头', (await ev("document.body.textContent.includes('产能') && document.body.textContent.includes('猎头行动')")) === true);
  await shot('02-rival-report');
  await closeModal();

  // 3. 收购谈判支付方式
  await ev("document.querySelector('[data-tab=finance]').click()");
  await sleep(350);
  check('财务页有收购谈判入口', (await ev("document.querySelectorAll('[data-act=acquire]').length")) > 0);
  await ev("document.querySelector('[data-act=acquire]').click()");
  await sleep(400);
  check('谈判弹窗含 3 种支付方式', (await ev("document.querySelectorAll('[data-pay]').length")) === 3);
  check('谈判弹窗含公关游说', !!(await ev("document.querySelector('#neg-charm')")));
  await ev("document.querySelector('[data-pay=installment]').click()");
  await sleep(200);
  check('切换分期后显示首付', (await ev("document.querySelector('#neg-total').textContent.includes('首付') || document.body.textContent.includes('首付')")) === true);
  await shot('03-negotiation');
  await closeModal();

  // 4. 子品牌发新品
  await ev("(()=>{document.querySelector('#sub-name').value='星尘';document.querySelector('#sub-name-en').value='Stardust';document.querySelector('#sub-pos').value='online';document.querySelector('[data-act=found-sub]').click();return true})()");
  await sleep(500);
  check('子品牌已成立', (await ev("document.querySelectorAll('[data-act=sub-release]').length")) > 0);
  await ev("document.querySelector('[data-act=sub-release]').click()");
  await sleep(500);
  check('子品牌新品发布后产品线有价格', (await ev("document.body.textContent.includes('星尘 X') || document.body.textContent.includes('星尘 S') || document.body.textContent.includes('星尘 Air') || document.body.textContent.includes('星尘 Note')")) === true);
  await shot('04-subsidiary');

  // 5. 发布会 mini-game
  await ev("document.querySelector('[data-tab=market]').click()");
  await sleep(350);
  await ev("document.querySelector('[data-act=open-stage]').click()");
  await sleep(1500);
  check('发布会 3D 舞台挂载', (await ev("!!document.querySelector('#stage-scene canvas')")) === true);
  check('发布会开始按钮存在', !!(await ev("document.querySelector('#stage-start')")));
  await ev("document.querySelector('#stage-start').click()");
  await sleep(300);
  check('定价猜谜出现 3 个候选', (await ev("document.querySelectorAll('[data-guess]').length")) === 3);
  await shot('05-stage-guess');
  await ev("document.querySelector('[data-guess]').click()");
  await sleep(300);
  check('卖点选择出现 4 项', (await ev("document.querySelectorAll('[data-pitch]').length")) === 4);
  await ev("document.querySelector('[data-pitch]').click()");
  await sleep(400);
  check('现场评分结果出现', (await ev("document.querySelector('.stage-result')?.textContent.includes('需求系数')")) === true);
  await shot('06-stage-result');
  await ev("document.querySelector('#stage-done').click()");
  await sleep(400);
  check('发布会结束弹窗关闭', (await ev("document.querySelectorAll('.modal-mask').length")) === 0);
  check('发布后无待发布机型', (await ev("document.querySelector('[data-act=open-stage]')?.disabled === true")) === true);

  // 6. 多机同场发布会：克隆两台新机 → 量产 → 一场发布会同时发布
  for (let i = 0; i < 2; i++) {
    await ev("document.querySelector('[data-tab=product]').click()");
    await sleep(250);
    await ev("document.querySelector('[data-act=clone-model]').click()");
    await sleep(400);
    const launched = await ev("(()=>{const b=[...document.querySelectorAll('[data-act=launch]')].pop(); if(!b)return 'none'; const d=b.disabled; b.click(); return d?'disabled':'ok'})()");
    if (launched !== 'ok') console.log('clone launch:', launched);
    await sleep(500);
  }
  await ev("document.querySelector('[data-tab=market]').click()");
  await sleep(350);
  const pendingText = await ev("document.querySelector('[data-act=open-stage]')?.textContent || ''");
  check('两台新机进入待发布', pendingText.includes('2 款'), pendingText);
  await ev("document.querySelector('[data-act=open-stage]').click()");
  await sleep(1400);
  check('发布会列表可选 2 款', (await ev("document.querySelectorAll('[data-release]').length")) === 2);
  const cost0 = await ev("document.querySelector('#stage-cost').textContent");
  await ev("document.querySelectorAll('[data-release]')[1].click()");
  await sleep(300);
  const cost1 = await ev("document.querySelector('#stage-cost').textContent");
  check('多机同场费用上调', cost0 !== cost1, `${cost0} -> ${cost1}`);
  await ev("document.querySelector('#stage-start').click()");
  await sleep(250);
  await ev("document.querySelector('[data-guess]').click()");
  await sleep(250);
  await ev("document.querySelector('[data-pitch]').click()");
  await sleep(400);
  check('多机发布会结果含发布 2 款', (await ev("document.querySelector('.stage-result')?.textContent.includes('本次发布') && document.querySelector('.stage-result')?.textContent.includes('2')")) === true);
  await shot('07-stage-multi');
  await ev("document.querySelector('#stage-done').click()");
  await sleep(400);
  check('多机发布后全部清空待发布', (await ev("document.querySelector('[data-act=open-stage]')?.disabled === true")) === true);

  console.log(`\nUI: ${pass} 通过 / ${fail} 失败`);
  console.log('errors:', errors.length ? errors.join(' | ') : 'none');
  ws.close();
  process.exit(fail || errors.length ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
// 新系统验收：产品线 / 人群分层 / 组织架构 / 资本运作
const BASE = 'http://127.0.0.1:9222';
const URL = process.argv[2] || 'http://127.0.0.1:8124/index.html';
const PREFIX = process.argv[3] || '.tmp/ns';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tabs = await (await fetch(BASE + '/json/list')).json();
  const tab = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await sleep(1600);
  errors.length = 0;

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) errors.push('eval: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  };
  const shot = async (n) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r.result?.data) (await import('node:fs')).writeFileSync(`${PREFIX}-${n}.png`, Buffer.from(r.result.data, 'base64'));
  };
  const click = (sel) => ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)return 'none';if(b.disabled)return 'disabled';b.click();return 'ok'})()`);

  await ev("localStorage.clear()");
  await send('Page.reload'); await sleep(1400);
  errors.length = 0;
  await ev("[...document.querySelectorAll('.menu-item')].find(x=>x.textContent.includes('沙盒模式')).click()"); await sleep(250);
  await ev("document.querySelector('#start').click()"); await sleep(800);

  // ---- 1. 产品线 ----
  await ev("document.querySelector('[data-tab=product]').click()"); await sleep(600);
  const lineupChip = await ev("document.querySelector('[data-lineup-target]').textContent.trim()");
  await click('[data-lineup-target]'); await sleep(500);
  const pickerCount = await ev("document.querySelectorAll('.modal .build-card').length");
  await shot('01-lineup-picker');
  const pickFlagship = await ev(`(()=>{const c=[...document.querySelectorAll('.modal .build-card')].find(x=>x.textContent.includes('旗舰系列'));if(!c)return 'none';c.querySelector('button').click();return 'ok'})()`);
  await sleep(900);
  const lineupChanged = await ev("document.querySelector('[data-lineup-target]')?.textContent.trim()");

  // ---- 2. 人群分层 ----
  await ev("document.querySelector('[data-tab=market]').click()"); await sleep(900);
  const segCount = await ev("document.querySelectorAll('.seg-card').length");
  const segText = await ev("document.querySelector('.seg-card')?.textContent.replace(/\\s+/g,' ').slice(0,80)");
  await shot('02-segments');

  // ---- 3. 组织架构 ----
  await ev("document.querySelector('[data-tab=company]').click()"); await sleep(700);
  const deptCount = await ev("document.querySelectorAll('.org-dept').length");
  const headBtns = await ev("document.querySelectorAll('[data-act=open-head]').length");
  await shot('03-org');
  await click('[data-act=open-head]'); await sleep(500);
  const candRows = await ev("document.querySelectorAll('.modal [data-act=appoint-head]').length");
  await shot('04-head-modal');
  await click('.modal [data-act=appoint-head]'); await sleep(700);
  const headsAfter = await ev("document.querySelectorAll('[data-act=clear-head]').length");
  const modalGone = await ev("!document.querySelector('.modal-mask')");

  // ---- 4. 资本运作 ----
  await ev("document.querySelector('[data-tab=finance]').click()"); await sleep(800);
  const cashBefore = await ev("document.querySelector('#topbar').textContent.match(/现金¥([\\d.]+[万亿]?)/)?.[1]");
  const founderBefore = await ev("[...document.querySelectorAll('.holder-row b')].map(x=>x.textContent).join(',')");
  await shot('05-capital');
  const raiseBtn = await ev(`(()=>{const b=[...document.querySelectorAll('[data-act=raise-capital]')].find(x=>!x.disabled);if(!b)return 'none';b.click();return 'ok'})()`);
  await sleep(700);
  const founderAfter = await ev("[...document.querySelectorAll('.holder-row b')].map(x=>x.textContent).join(',')");
  const cashAfter = await ev("document.querySelector('#topbar').textContent.match(/现金¥([\\d.]+[万亿]?)/)?.[1]");
  await shot('06-after-raise');

  console.log('lineup chip :', lineupChip);
  console.log('picker      :', pickerCount, '| pick 旗舰:', pickFlagship, '| after:', lineupChanged);
  console.log('segments    :', segCount, '|', segText);
  console.log('org depts   :', deptCount, '| 可任命部门:', headBtns, '| 候选人:', candRows);
  console.log('head result :', '已任命', headsAfter, '| 弹窗已关', modalGone);
  console.log('capital     :', '融资前', founderBefore, cashBefore, '->', founderAfter, cashAfter, '| 按钮', raiseBtn);
  console.log('errors      :', errors.length ? errors.slice(0, 5) : 'none');
  ws.close();
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });

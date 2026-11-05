// 园区 3D 验收：楼宇实体 / 双视角剖面 / 员工行为 / 室内编辑
const BASE = 'http://127.0.0.1:9222';
const URL = process.argv[2] || 'http://127.0.0.1:8124/index.html';
const PREFIX = process.argv[3] || '.tmp/o3';
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await sleep(1500);
  errors.length = 0;

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) errors.push('eval: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  };
  const click = async (sel) => ev(`(()=>{const b=document.querySelector('${sel}');if(b){b.click();return 'clicked'}return 'none'})()`);
  const shot = async (n) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r.result?.data) (await import('node:fs')).writeFileSync(`${PREFIX}-${n}.png`, Buffer.from(r.result.data, 'base64'));
  };

  await ev("localStorage.clear()");
  await send('Page.reload'); await sleep(1400);
  errors.length = 0;

  // 沙盒 2020 开局
  await ev("document.querySelector('[data-mode=sandbox]').click()"); await sleep(300);
  await ev("(()=>{const y=document.querySelector('#f-year');y.value='2020';y.dispatchEvent(new Event('change'));document.querySelector('#f-name').value='启明科技';return true})()");
  await ev("document.querySelector('#start').click()"); await sleep(900);

  // 买两块地、建研发中心 + 生产基地（施工中）
  await click('[data-tab=hq]'); await sleep(1200);
  await click('[data-act=buy-plot]'); await sleep(300);
  await click('[data-act=buy-plot]'); await sleep(300);
  await ev("(()=>{const cards=[...document.querySelectorAll('.plot')];const b=cards.map(p=>p.querySelector('[data-act=open-build]')).find(x=>x);if(b)b.click();return 'ok'})()"); await sleep(400);
  await ev("(()=>{const card=[...document.querySelectorAll('.build-card')].find(c=>c.textContent.includes('研发中心'));const b=card&&card.querySelector('[data-act=build]');if(b)b.click();return b?'ok':'none'})()"); await sleep(400);
  await ev("(()=>{const cards=[...document.querySelectorAll('.plot')];const b=cards.map(p=>p.querySelector('[data-act=open-build]')).find(x=>x);if(b)b.click();return 'ok'})()"); await sleep(400);
  await ev("(()=>{const card=[...document.querySelectorAll('.build-card')].find(c=>c.textContent.includes('生产基地'));const b=card&&card.querySelector('[data-act=build]');if(b)b.click();return b?'ok':'none'})()"); await sleep(600);
  await shot('01-campus-iso');
  console.log('view buttons:', await ev("[...document.querySelectorAll('[data-view]')].map(b=>b.textContent).join('|')"));

  // 切俯视
  await click('[data-view=top]'); await sleep(1400);
  await shot('02-campus-top');
  await click('[data-view=iso]'); await sleep(1400);

  // 员工行为：等几秒让人走动起来
  await sleep(4000);
  await shot('03-people-walking');

  // 室内编辑：放家具 + 隔墙
  await ev("document.querySelector('[data-act=open-layout]')?.click()"); await sleep(500);
  await shot('04-layout-modal');
  console.log('layout dept chips:', await ev("[...document.querySelectorAll('[data-act=layout-dept]')].length"));
  console.log('layout cells:', await ev("[...document.querySelectorAll('.lc-cell')].length"));
  // 放一张工位桌（研发部第一格）
  await ev("(()=>{const c=[...document.querySelectorAll('.lc-cell')][0];c.click();return 'ok'})()"); await sleep(400);
  // 再放绿植
  await ev("(()=>{const c=[...document.querySelectorAll('.lc-cell')][1];c.click();return 'ok'})()"); await sleep(400);
  await shot('05-layout-placed');
  console.log('placed items (filled cells in modal):', await ev("[...document.querySelectorAll('.lc-cell.filled')].length"));
  console.log('modal caption:', await ev("(()=>{const t=document.querySelector('.modal-title');return t?t.textContent:'none'})()"));
  await ev("document.querySelector('.modal-mask [data-close]').click()"); await sleep(300);
  await shot('06-office-with-furniture');

  console.log('\n--- errors ---');
  errors.slice(0, 8).forEach((e) => console.log(e));
  if (!errors.length) console.log('(none)');
  ws.close();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });

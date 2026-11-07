// 园区 3D 验收（v0.8.0 布局系统）：房间拖放/缩放/家具单源/隔墙寻路/平面规划双端
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
  await ev("[...document.querySelectorAll('.menu-item')].find(x=>x.textContent.includes('沙盒模式')).click()"); await sleep(300);
  await ev("(()=>{const y=document.querySelector('#f-year');y.value='2020';y.dispatchEvent(new Event('change'));document.querySelector('#f-name').value='启明科技';return true})()");
  await ev("document.querySelector('#start').click()"); await sleep(900);

  await click('[data-tab=hq]'); await sleep(1500);
  const T = "document.querySelector('#office-scene').__office.__test";
  console.log('office handle:', await ev("!!document.querySelector('#office-scene').__office"));
  console.log('rooms:', await ev(`Object.keys(${T}.layout().rooms).length`));
  console.log('reach default:', await ev(`JSON.stringify(${T}.reach())`));

  // 施工中的地块楼宇（保留原有验收点）
  await click('[data-act=buy-plot]'); await sleep(300);
  await click('[data-act=buy-plot]'); await sleep(300);
  await ev("(()=>{const cards=[...document.querySelectorAll('.plot')];const b=cards.map(p=>p.querySelector('[data-act=open-build]')).find(x=>x);if(b)b.click();return 'ok'})()"); await sleep(400);
  await ev("(()=>{const card=[...document.querySelectorAll('.build-card')].find(c=>c.textContent.includes('研发中心'));const b=card&&card.querySelector('[data-act=build]');if(b)b.click();return b?'ok':'none'})()"); await sleep(400);
  await shot('01-campus-iso');
  await click('[data-view=top]'); await sleep(1400);
  await shot('02-campus-top');
  await click('[data-view=iso]'); await sleep(1400);
  await sleep(3500);
  await shot('03-people-walking');

  // ===== 布局编辑（v2）：3D 编辑模式 =====
  await click('[data-edit]'); await sleep(500);
  await shot('04-edit-mode-on');
  console.log('editbar:', await ev("(()=>{const b=[...document.querySelectorAll('div')].find(x=>x.style.display==='flex'&&x.textContent.includes('拖动房间'));return b?'flex':'none'})()"));
  console.log('move rnd->corridor:', await ev(`JSON.stringify(${T}.moveRoom('rnd', 0, 8))`));
  console.log('resize rnd 8x5:', await ev(`JSON.stringify(${T}.resizeRoom('rnd', 8, 5))`));
  console.log('place desk (5,0):', await ev(`JSON.stringify(${T}.placeFurniture('rnd', 'desk', 5, 0))`));
  console.log('place plant (0,4):', await ev(`JSON.stringify(${T}.placeFurniture('rnd', 'plant', 0, 4))`));
  console.log('place desk on builtin (0,0):', await ev(`JSON.stringify(${T}.placeFurniture('rnd', 'desk', 0, 0))`));
  console.log('wall (h,1,3):', await ev(`JSON.stringify(${T}.toggleWall('rnd', { orient: 'h', ex: 1, ey: 3 }))`));
  console.log('reach after edits:', await ev(`JSON.stringify(${T}.reach())`));
  console.log('items now:', await ev(`JSON.stringify(${T}.layout().items.length)`));
  await sleep(3000);
  await shot('05-edit-applied-3d');
  await click('[data-edit]'); await sleep(300);

  // ===== 平面规划页（2D）=====
  await click('[data-act=open-floorplan]'); await sleep(600);
  await shot('06-floorplan-2d');
  console.log('floorplan overlay:', await ev("!!document.querySelector('[data-fp=cv]')"));
  console.log('fp tools:', await ev("[...document.querySelectorAll('[data-ft]')].length"));
  await ev("(()=>{const s=document.querySelector('#office-scene').__office.__test;s.placeFurniture('design','plant',1,1);return 'ok'})()"); await sleep(300);
  await shot('07-floorplan-synced');
  await click('[data-fp=close]'); await sleep(400);
  await shot('08-office-after-plan');

  console.log('');
  console.log('--- errors ---');
  errors.slice(0, 8).forEach((e) => console.log(String(e).slice(0, 300)));
  if (!errors.length) console.log('(none)');
  ws.close();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });

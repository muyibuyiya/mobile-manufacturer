// 设备形态：平板 / 圆表 / 方表 设计与渲染烟测
const BASE = 'http://127.0.0.1:9222';
const URL = process.argv[2] || 'http://127.0.0.1:8124/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tabs = await (await fetch(BASE + '/json/list')).json();
  const page = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
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
  await ev(`[...document.querySelectorAll('.menu-item')].find(x => x.textContent.includes('沙盒'))?.click()`); await sleep(300);
  await ev(`(() => { const y = document.querySelector('#f-year'); y.value = '2020'; y.dispatchEvent(new Event('change')); return true; })()`); await sleep(200);
  await ev(`document.querySelector('#start')?.click()`); await sleep(1500);
  await ev(`document.querySelector('[data-tab=product]')?.click()`); await sleep(300);
  await ev(`document.querySelector('[data-act="design"]')?.click()`); await sleep(1200);
  errors.length = 0;

  const pick = async (tpl) => {
    await ev(`(() => { const s = document.querySelector('[data-k="template"]'); if (!s) return false; s.value = '${tpl}'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await sleep(600);
    return ev(`(() => ({ len: document.querySelector('[data-k="body.length"]')?.value, wid: document.querySelector('[data-k="body.width"]')?.value, corner: document.querySelector('[data-k="body.corner"]')?.value }))()`);
  };
  check('设计器可打开', await ev(`!!document.querySelector('[data-k="template"]')`));
  const tablet = await pick('tablet');
  check('平板模板可切换', tablet.len === '250' && tablet.wid === '176', JSON.stringify(tablet));
  check('平板有 3D 画布', await ev(`!!document.querySelector('canvas')`));
  const watch = await pick('watch_round');
  check('圆表模板可切换', watch.len === '46' && watch.wid === '46' && watch.corner === '22.5', JSON.stringify(watch));
  const square = await pick('watch_square');
  check('方表模板可切换', square.len === '42' && square.wid === '42' && square.corner === '4', JSON.stringify(square));
  check('手表无摄像头配置', await ev(`!document.querySelector('[data-k="camera.lenses.0.type"]')`));
  check('设计器有包装设计', await ev(`!!document.querySelector('[data-k="packaging.material"]') && document.body.textContent.includes('包装评分')`));
  const pkg = await ev(`(() => { const s = document.querySelector('[data-k="packaging.material"]'); s.value = 'premium'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; })()`);
  await sleep(250);
  check('包装材质可切换', pkg === 'premium' && await ev(`/包装评分 [56]/.test(document.body.textContent)`), pkg);
  check('无运行时报错', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  ws.close();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
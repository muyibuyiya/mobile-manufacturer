// 时间推进回归：时间只由玩家手动推进（无自动连播、无速度按钮）
const BASE = 'http://127.0.0.1:9222';
const URL = process.argv[2] || 'http://127.0.0.1:8124/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tabs = await (await fetch(BASE + '/json/list')).json();
  const page = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) errors.push('eval: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  };
  let bad = 0;
  const check = (name, ok, detail = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
  const dateOf = () => ev(`(() => { const t = document.querySelector('.tb-time .stat-inline .v')?.textContent || ''; const m = /(\\d+)年(\\d+)月/.exec(t); return m ? Number(m[1]) * 12 + Number(m[2]) : NaN; })()`);

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL }); await sleep(1500);
  await ev(`localStorage.clear()`); await send('Page.reload'); await sleep(1500);

  await ev(`[...document.querySelectorAll('.menu-item')].find(x => x.textContent.includes('沙盒'))?.click()`); await sleep(400);
  await ev(`document.querySelector('#start')?.click()`); await sleep(1800);
  check('游戏已进入', await ev(`!!document.querySelector('.game')`));

  check('顶栏无速度/自动推进按钮', (await ev(`document.querySelectorAll('[data-act=speed]').length`)) === 0);
  check('顶栏有「下个月」', await ev(`!!document.querySelector('[data-act=advance]')`));
  check('顶栏有「推进一年」', await ev(`!!document.querySelector('[data-act=advance-year]')`));

  // 等待 3 秒：时间必须原地不动
  const d0 = await dateOf();
  await sleep(3200);
  const d1 = await dateOf();
  check('空闲 3 秒时间不自行推进', d0 === d1 && !Number.isNaN(d0), `${d0} -> ${d1}`);

  // 手动推进 1 个月
  await ev(`document.querySelector('[data-act=advance]').click()`); await sleep(700);
  const d2 = await dateOf();
  check('「下个月」推进 1 个月', d2 - d1 === 1, `${d1} -> ${d2}`);

  // 推进一年 = 12 个月（含跨年）
  await ev(`document.querySelector('[data-act=advance-year]').click()`); await sleep(3000);
  const d3 = await dateOf();
  check('「推进一年」推进 12 个月', d3 - d2 === 12, `${d2} -> ${d3}`);

  // 弹窗打开期间也不会走时间
  await ev(`document.querySelector('[data-act=open-news]').click()`); await sleep(400);
  const d4 = await dateOf();
  await sleep(1500);
  const d5 = await dateOf();
  check('弹窗期间时间不流逝', d4 === d5, `${d4} -> ${d5}`);
  check('无运行时报错', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log(`\n1 suite, ${bad} failed`);
  ws.close();
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
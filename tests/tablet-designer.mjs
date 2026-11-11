// 平板设计器布局回归：评估面板只在画布内浮起，不改变画布列宽，不越界到参数区
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
    if (r.result?.exceptionDetails) errors.push('eval: ' + (r.result.exceptionDetails.exception?.description || ''));
    return r.result?.result?.value;
  };
  let bad = 0;
  const check = (name, ok, detail = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const openDesigner = async (w, h) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: URL }); await sleep(1400);
    await ev(`localStorage.clear()`); await sleep(100);
    await ev(`localStorage.setItem('dz_assess_collapsed','1')`);
    await send('Page.reload'); await sleep(1500);
    await ev(`[...document.querySelectorAll('.menu-item')].find(x => x.textContent.includes('沙盒'))?.click()`); await sleep(400);
    await ev(`document.querySelector('#start')?.click()`); await sleep(1600);
    await ev(`document.querySelector('[data-tab=product]')?.click()`); await sleep(400);
    await ev(`document.querySelector('[data-act=design]')?.click()`); await sleep(1500);
  };

  const measure = () => ev(`(() => {
    const d = document.querySelector('.designer');
    const stage = document.querySelector('.dz-stage');
    const wrap = document.querySelector('.dz-canvas-wrap');
    const tab = document.querySelector('#dz-assess-tab');
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), b: Math.round(b.bottom), right: Math.round(b.right) }; };
    return {
      scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
      cols: getComputedStyle(d).gridTemplateColumns.trim().split(/\\s+(?![^(]*\\))/).length,
      stage: r(stage), wrap: r(wrap), tab: tab ? r(tab) : null, tabText: tab?.textContent || '',
    };
  })()`);

  // 1) 平板横屏：两侧栏默认折叠，画布占满整宽
  await openDesigner(1100, 800);
  const m0 = await measure();
  check('1100×800 默认折叠（画布全宽）', m0.cols === 1 && m0.stage.w >= 900, `cols=${m0.cols} ${m0.stage.w}px`);
  check('1100×800 无横向溢出', m0.scrollW <= m0.innerW + 1, `${m0.scrollW}/${m0.innerW}`);
  check('1100×800 折叠时悬浮评估按钮在画布右上角', !!m0.tab && m0.tab.y >= m0.wrap.y && m0.tab.right <= m0.wrap.right + 1, JSON.stringify(m0.tab));

  // 展开左栏：恢复两列，画布仍足够宽
  await ev(`document.querySelector('#dz-panel-toggle')?.click()`); await sleep(350);
  const m1 = await measure();
  check('1100×800 展开左栏后为两列', m1.cols === 2 && m1.stage.w >= 700, `cols=${m1.cols} ${m1.stage.w}px`);

  // 2) 展开评估：左栏自动收起，面板完整落在画布内，画布回到折叠时的全宽
  await ev(`document.querySelector('#dz-assess-tab')?.click()`); await sleep(500);
  const expanded = await ev(`(() => {
    const p = document.querySelector('#dz-right'); const wrap = document.querySelector('.dz-canvas-wrap');
    const pb = p.getBoundingClientRect(); const wb = wrap.getBoundingClientRect();
    return { inside: pb.left >= wb.left - 1 && pb.right <= wb.right + 1 && pb.top >= wb.top - 1 && pb.bottom <= wb.bottom + 1,
      pw: Math.round(pb.width), ph: Math.round(pb.height), wrapW: Math.round(wb.width), opacity: getComputedStyle(p).opacity, hasClose: !!p.querySelector('[data-assess-close]') };
  })()`);
  check('展开后面板完整落在画布内', expanded.inside, JSON.stringify(expanded));
  check('面板可见且可关闭', expanded.opacity === '1' && expanded.hasClose, JSON.stringify(expanded));
  const m2 = await measure();
  check('展开面板时左栏自动收起', m2.cols === 1, `cols=${m2.cols}`);
  check('展开不改变画布宽度（相对折叠态）', m2.stage.w === m0.stage.w, `${m0.stage.w} -> ${m2.stage.w}`);

  // 3) 平板竖屏：画布与参数纵向堆叠，面板只盖画布
  await openDesigner(900, 1440);
  const m3 = await measure();
  check('900×1440 竖屏纵向堆叠（画布在参数之上）', m3.stage.y < m3.wrap.y + m3.wrap.h && m3.stage.w >= 700, JSON.stringify(m3.stage));
  await ev(`document.querySelector('#dz-assess-tab')?.click()`); await sleep(500);
  const v = await ev(`(() => {
    const p = document.querySelector('#dz-right'); const wrap = document.querySelector('.dz-canvas-wrap');
    const pb = p.getBoundingClientRect(); const wb = wrap.getBoundingClientRect();
    return { inside: pb.top >= wb.top - 1 && pb.bottom <= wb.bottom + 1, ph: Math.round(pb.height), wrapH: Math.round(wb.height) };
  })()`);
  check('竖屏面板不越界到参数区', v.inside && v.ph <= v.wrapH + 1, JSON.stringify(v));

  check('无运行时报错', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log(`\n1 suite, ${bad} failed`);
  ws.close();
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
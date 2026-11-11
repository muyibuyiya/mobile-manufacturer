// 全页面布局回归：普通页面不得横向滚动（科技树例外），卡片内容不得撑破边框
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

  const boot = async (w, h) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: URL }); await sleep(1400);
    await ev(`localStorage.clear()`); await send('Page.reload'); await sleep(1500);
    await ev(`[...document.querySelectorAll('.menu-item')].find(x => x.textContent.includes('沙盒'))?.click()`); await sleep(400);
    await ev(`(() => { const y = document.querySelector('#f-year'); y.value = '2020'; y.dispatchEvent(new Event('change')); return true; })()`);
    await ev(`document.querySelector('#start')?.click()`); await sleep(1700);
  };

  for (const [w, h] of [[1024, 768], [1440, 900], [900, 1440]]) {
    await boot(w, h);
    const ids = await ev(`[...document.querySelectorAll('.nav-item')].map(el => el.dataset.tab).filter(Boolean)`);
    const over = [];
    for (const t of ids) {
      await ev(`document.querySelector('[data-tab="${t}"]')?.click()`); await sleep(350);
      const r = await ev(`(() => { const c = document.querySelector('.content'); return { doc: document.documentElement.scrollWidth, inner: innerWidth, cw: c.scrollWidth, cc: c.clientWidth, top: document.querySelector('.topbar').scrollWidth }; })()`);
      if (r.doc > r.inner + 1 || r.cw > r.cc + 1) over.push({ tab: t, doc: r.doc, inner: r.inner, cw: r.cw, cc: r.cc });
    }
    // 科技树是唯一允许横向滚动的页面
    const techOver = over.filter((o) => o.tab === 'tech');
    const others = over.filter((o) => o.tab !== 'tech');
    check(`${w}×${h} 普通页面无横向滚动`, others.length === 0, others.length ? JSON.stringify(others) : '');
    if (techOver.length) check(`${w}×${h} 科技树可横向滚动（设计允许）`, true);
    const techScroll = await ev(`(() => { document.querySelector('[data-tab="tech"]')?.click(); const l = document.querySelector('.tech-lanes'); if (!l) return null; l.scrollLeft = l.scrollWidth; return { scrollable: l.scrollWidth > l.clientWidth, moved: l.scrollLeft > 0 }; })()`);
    await sleep(250);
    check(`${w}×${h} 科技树泳道可拖动`, !!techScroll && techScroll.scrollable && techScroll.moved, JSON.stringify(techScroll));

    // 自研部门卡片：平板两列，按钮不越界
    await ev(`document.querySelector('[data-tab="selfrnd"]')?.click()`); await sleep(500);
    const rnd = await ev(`(() => {
      const g = document.querySelector('.divisions-grid');
      const cols = g ? getComputedStyle(g).gridTemplateColumns.split(/\\s+(?![^(]*\\))/).length : 0;
      let overflow = [];
      document.querySelectorAll('.divisions-grid .org-exec').forEach((card) => {
        const cb = card.getBoundingClientRect();
        [...card.querySelectorAll('button, span, b')].forEach((el) => {
          const b = el.getBoundingClientRect();
          if (b.width > 0 && (b.right > cb.right + 1 || b.left < cb.left - 1)) overflow.push((el.textContent || '').trim().slice(0, 12));
        });
      });
      return { cols, overflow: overflow.slice(0, 4) };
    })()`);
    check(`${w}×${h} 部门卡片两列`, rnd.cols === 2, `cols=${rnd.cols}`);
    check(`${w}×${h} 卡片内容不越界`, rnd.overflow.length === 0, JSON.stringify(rnd.overflow));
  }

  check('无运行时报错', errors.length === 0, errors.slice(0, 2).join(' | '));
  console.log(`\n1 suite, ${bad} failed`);
  ws.close();
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
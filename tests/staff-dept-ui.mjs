// UI 回归：自研部门在升级期间仍可单独设计新品；组织页一键按专业分配
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
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  try { await send('Network.setBypassServiceWorker', { bypass: true }); } catch (e) { /* older chrome */ }
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL + '?t=' + Date.now() }); await sleep(1500);
  await ev(`localStorage.clear()`); await send('Page.reload'); await sleep(1500);
  await ev(`[...document.querySelectorAll('.menu-item')].find(x => x.textContent.includes('沙盒'))?.click()`); await sleep(400);
  await ev(`(() => { const y = document.querySelector('#f-year'); y.value = '2020'; y.dispatchEvent(new Event('change')); const c = document.querySelector('#f-cash'); c.value = '5000000000'; c.dispatchEvent(new Event('input')); return true; })()`);
  await ev(`document.querySelector('#start')?.click()`); await sleep(1700);

  // ---- 1. 自研部门：成立 → 升级中仍能设计新产品 ----
  await ev(`document.querySelector('[data-tab="selfrnd"]')?.click()`); await sleep(600);
  const built = await ev(`(() => { const b = document.querySelector('[data-act="div-build"][data-id="chip"]'); if (!b) return false; b.click(); return true; })()`);
  await sleep(600);
  check('可成立半导体研发中心', built === true && (await ev(`document.body.textContent.includes('设计槽位')`)));

  await ev(`document.querySelector('[data-act="div-upgrade"][data-id="chip"]')?.click()`); await sleep(600);
  check('升级立项弹窗打开', await ev(`!!document.querySelector('#rn-name')`));
  const upgraded = await ev(`(() => {
    const scope = document.querySelector('#rn-go')?.closest('.modal-mask') || document; const set = (id, v) => { const el = scope.querySelector(id); if (!el) return false; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; };
    set('#rn-name', '升级芯');
    set('#rn-big-arch', 'a78');
    set('#rn-big-n', '2');
    set('#rn-big-ghz', '2.4');
    set('#rn-gpu-arch', 'mali_g78');
    set('#rn-gpu-cores', '8');
    document.querySelector('#rn-go')?.click();
    return true;
  })()`);
  await sleep(900);
  check('升级已立项（弹窗关闭）', upgraded === true && !(await ev(`!!document.querySelector('#rn-name')`)));
  check('升级中卡片显示进度', await ev(`document.body.textContent.includes('研发升级 Lv.2 中')`));
  check('升级中仍有「＋ 设计新产品」按钮', await ev(`!!document.querySelector('[data-act="div-design"][data-id="chip"]')`));
  check('卡片显示设计槽位', await ev(`/设计槽位 \\d+\\/\\d+/.test(document.body.textContent)`));

  // 点「设计新产品」→ 走 design 分支，产品进池
await ev(`document.querySelector('[data-act="div-design"][data-id="chip"]')?.click()`); await sleep(700);
  check('「设计新产品」打开立项弹窗', await ev(`!!document.querySelector('#rn-name')`));
  await ev(`(() => {
    const scope = document.querySelector('#rn-go')?.closest('.modal-mask') || document; const set = (id, v) => { const el = scope.querySelector(id); if (!el) return false; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; };
    set('#rn-name', '独立新品');
    set('#rn-big-arch', 'a78');
    set('#rn-big-n', '2');
    set('#rn-big-ghz', '2.4');
    set('#rn-gpu-arch', 'mali_g78');
    set('#rn-gpu-cores', '8');
    document.querySelector('#rn-go')?.click();
    return true;
  })()`);
  await sleep(900);
  check('设计新品后弹窗关闭', await ev(`!document.querySelector('#rn-name')`), await ev(`[...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')`));
  check('独立设计的新品进入产品池', await ev(`document.body.textContent.includes('独立新品')`), await ev(`[...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')`));

  // ---- 2. 组织页：一键按专业分配 ----
  await ev(`document.querySelector('[data-tab="company"]')?.click()`); await sleep(700);
  const before = await ev(`(() => {
    const rows = [...document.querySelectorAll('select[data-field="emp-dept"]')];
    return { total: rows.length, filled: rows.filter((s) => s.value).length };
  })()`);
  check('组织页有员工名册', before.total > 0, JSON.stringify(before));
  check('有一键按专业分配按钮', await ev(`!!document.querySelector('[data-act="auto-assign-dept"]')`));
  await ev(`document.querySelector('[data-act="auto-assign-dept"]')?.click()`); await sleep(700);
  const after = await ev(`(() => {
    const FIELD_DEPT = { 通信工程: ['rnd'], 微电子: ['rnd'], 工业设计: ['design'], 软件工程: ['sw'], 材料科学: ['prod'], 质量管理: ['qa'], 供应链管理: ['supply'], 市场营销: ['mkt', 'sales'], 财务管理: ['fin', 'hr'] };
    const rows = [...document.querySelectorAll('tbody tr')].filter((tr) => tr.querySelector('select[data-field="emp-dept"]'));
    const bad = [];
    for (const tr of rows) {
      const sel = tr.querySelector('select[data-field="emp-dept"]');
      const field = (tr.querySelector('.emp-field')?.textContent || '').trim();
      if (!sel.value) { bad.push({ field, dept: sel.value }); continue; }
      if (field && sel.value !== 'exec' && !FIELD_DEPT[field].includes(sel.value)) bad.push({ field, dept: sel.value });
    }
    return { rows: rows.length, bad: bad.slice(0, 5) };
  })()`);
  check('分配后所有员工都有部门', after.rows > 0 && after.bad.every((b) => b.dept), JSON.stringify(after.bad));
  check('员工部门与其专业匹配', after.bad.length === 0, JSON.stringify(after.bad));

  check('无运行时报错', errors.length === 0, errors.slice(0, 2).join(' | '));
  console.log(`\n1 suite, ${bad} failed`);
  ws.close();
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
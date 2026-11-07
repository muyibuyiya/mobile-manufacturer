// 折叠屏视觉验收：2D 展开/折叠（fold/flip）+ 3D 各视角 + 研发立项弹窗输入框可读性
const BASE = 'http://127.0.0.1:9222';
const URL = process.argv[2] || 'http://127.0.0.1:8124/index.html';
const PREFIX = process.argv[3] || '.tmp/fold';
const fs = await import('node:fs');
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await sleep(1600);

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) errors.push('eval: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  };
  const shot = async (n) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r.result?.data) fs.writeFileSync(`${PREFIX}-${n}.png`, Buffer.from(r.result.data, 'base64'));
  };

  await ev("localStorage.clear()");
  await ev("[...document.querySelectorAll('.menu-item')].find(x=>x.textContent.includes('经营模式')).click()"); await sleep(200);
  await ev("(()=>{const y=document.querySelector('#f-year');y.value='2020';y.dispatchEvent(new Event('change'));return 1})()");
  await ev("document.querySelector('#start').click()"); await sleep(700);
  await ev("document.querySelector('[data-tab=product]').click()"); await sleep(200);
  await ev("document.querySelector('[data-act=create-model]').click()"); await sleep(900);

  for (const kind of ['fold', 'flip']) {
    // 切换折叠结构（input 事件触发 applyValue → 机身重配 + 自动贴合屏幕）
    await ev(`(()=>{
      const sel = document.querySelector('#dz-left select[data-k="body.fold"]');
      sel.value = '${kind}';
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      return sel.value;
    })()`);
    await sleep(500);
    if (kind === 'flip') {
      // 竖向翻折内屏用细长比例（4:3 会让屏幕过小）
      await ev(`(()=>{
        const sel = document.querySelector('#dz-left select[data-k="screen.aspect"]');
        if (!sel) return 'no-aspect';
        sel.value = '19.5:9';
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        return sel.value;
      })()`);
      await sleep(500);
      // 竖向翻折必须配外屏（展开背面下半部可见）
      await ev(`(()=>{
        const r = document.querySelector('#dz-left input[data-k="body.coverScreen.inch"]');
        if (!r) return 'no-cover-input';
        r.value = '2.6';
        r.dispatchEvent(new Event('input', { bubbles: true }));
        return 'cover 2.6';
      })()`);
      await sleep(500);
    }
    // 本轮新特性配置：4 扬声器 + 麦克风槽形样式 + 潜望长焦镜头 + 背面 Logo 金属材质
    await ev(`(()=>{
      const q = document.querySelector('#dz-left input[data-k="body.ports.quadSpeaker"]');
      if (q && !q.checked) q.click();
      const ms = document.querySelector('#dz-left select[data-k="body.ports.micStyle"]');
      if (ms) { ms.value = 'slot2'; ms.dispatchEvent(new Event('input', { bubbles: true })); }
      const add = document.querySelector('#dz-left [data-lens-add]');
      if (add) add.click();
      const sels = [...document.querySelectorAll('#dz-left select[data-k$=".type"][data-k^="camera.lenses."]')];
      const s = sels[sels.length - 1];
      if (s) { s.value = 'periscope'; s.dispatchEvent(new Event('input', { bubbles: true })); }
      return 'config ok';
    })()`);
    await sleep(600);
    await ev(`(()=>{
      const lb = document.querySelector('#dz-left input[data-k="logoOnBack"]');
      if (lb && !lb.checked) lb.click();
      return 'logo on';
    })()`);
    await sleep(400);
    await ev(`(()=>{
      const lf = document.querySelector('#dz-left select[data-k="branding.logoFinish"]');
      if (!lf) return 'no-finish-select';
      lf.value = 'metal';
      lf.dispatchEvent(new Event('input', { bubbles: true }));
      return 'finish metal';
    })()`);
    await sleep(400);
    // 2D 展开态
    await ev("document.querySelector('[data-fold=open]')?.click()");
    await sleep(400);
    await shot(`10-${kind}-2d-open`);
    // 2D 折叠态
    await ev("document.querySelector('[data-fold=folded]')?.click()");
    await sleep(400);
    await shot(`11-${kind}-2d-folded`);
    // 3D：正面 / 背面 / 45° + 折叠态（进 3D 先切回展开态，foldView 会从 2D 步骤遗留 folded）
    await ev("document.querySelectorAll('[data-vm]')[1].click()"); await sleep(900);
    await ev("document.querySelector('[data-fold=open]')?.click()"); await sleep(600);
    for (const cam of ['front', 'back', 'hero']) {
      await ev(`document.querySelector('[data-cam=${cam}]').click()`); await sleep(700);
      await shot(`12-${kind}-3d-${cam}`);
    }
    await ev("document.querySelector('[data-fold=folded]')?.click()"); await sleep(800);
    for (const cam of ['front', 'side', 'hero']) {
      await ev(`(()=>{const b=document.querySelector('[data-cam=${cam}]');if(b)b.click();return b?'cam ${cam}':'no ${cam}'})()`);
      await sleep(700);
      await shot(`13-${kind}-3d-folded-${cam}`);
    }
    await ev("document.querySelector('[data-fold=open]')?.click()"); await sleep(600);
    // 回 2D 直板态，准备下一种结构
    await ev("document.querySelectorAll('[data-vm]')[0].click()"); await sleep(400);
  }

  // 校验信息：屏幕是否溢出机身（fold 展开态正视图）
  const check = await ev(`(()=>{
    const out = [];
    const canvas = document.querySelector('#dz-2d');
    out.push('2d canvas: ' + canvas.width + 'x' + canvas.height);
    return out.join(' | ');
  })()`);
  console.log('check:', check);

  // 关闭设计器 → 总部页 → 建立第一个研发部门 → 打开立项弹窗测输入框
  await ev("document.querySelector('#dz-close').click()"); await sleep(400);
  const r1 = await ev("(()=>{document.querySelector('[data-tab=company]')?.click();return 'company-clicked'})()");
  await sleep(300);
  const r2 = await ev(`(()=>{
    const ids=[...document.querySelectorAll('[data-act=div-build]')].map(b=>b.dataset.id);
    for (const id of ids){
      const b=document.querySelector('[data-act=div-build][data-id="'+id+'"]');
      if(!b) continue;
      b.click();
      const up=document.querySelector('[data-act=div-upgrade]');
      if(up){ up.click(); return 'modal-open via '+id; }
    }
    return 'all-failed count='+ids.length;
  })()`);
  await sleep(300);
  console.log('div:', r1, r2);
  const inputStyle = await ev(`(()=>{
    const el = document.querySelector('#rn-name');
    if (!el) return 'NO #rn-name';
    el.value = 'MOC3-gen1';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const cs = getComputedStyle(el);
    return JSON.stringify({ color: cs.color, bg: cs.backgroundColor, fs: cs.fontSize, val: el.value });
  })()`);
  console.log('rn-name style:', inputStyle);
  await shot('20-rn-modal');
  console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
  ws.close();
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });

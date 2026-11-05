// PWA 图标生成：零依赖，程序化绘制 + 手写 PNG 编码（zlib）
// 产物：icons/icon-180.png（apple-touch）/ icon-192.png / icon-512.png / maskable-512.png
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT = path.join(__dirname, '..', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// ---------- PNG 编码（RGBA8 → PNG） ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function pngEncode(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 绘制 ----------
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}
const mix = (a, b, t) => a + (b - a) * t;

// 主图标：圆角深色底 + 蓝色辉光 + 白色 M 标（与游戏 logo-mark 呼应）
// maskable：全出血方形底（系统自裁），内容缩到 76% 安全区
function drawIcon(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const S = size;
  const inner = maskable ? 0.76 : 1; // 内容安全区
  const radius = S * (maskable ? 0 : 0.225);
  const stroke = S * 0.052 * inner;
  // M 线段（相对坐标）
  const cx = 0.5, my = 0.52, mw = 0.18 * inner, mh = 0.15 * inner;
  const segs = [
    [cx - mw, my - mh, cx - mw, my + mh],
    [cx + mw, my - mh, cx + mw, my + mh],
    [cx - mw, my - mh, cx, my + mh * 0.25],
    [cx + mw, my - mh, cx, my + mh * 0.25],
  ];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const fx = (x + 0.5) / S, fy = (y + 0.5) / S;
      // 圆角底
      const rx = Math.max(radius - x - 0.5, x + 0.5 - (S - radius), 0);
      const ry = Math.max(radius - y - 0.5, y + 0.5 - (S - radius), 0);
      if (!maskable && Math.hypot(rx, ry) > radius) { px[i + 3] = 0; continue; }
      // 背景渐变 + 辉光
      const g = Math.min(1, fy * 1.15);
      let r = mix(24, 11, g), gg = mix(34, 17, g), b = mix(48, 24, g);
      const glow = Math.max(0, 1 - Math.hypot(fx - 0.5, fy - 0.4) / 0.38);
      r += glow * 46; gg += glow * 104; b += glow * 168;
      // M 标（白色，轻微上亮下暗）
      let d = 1e9;
      for (const [ax, ay, bx2, by2] of segs) {
        d = Math.min(d, segDist(x + 0.5, y + 0.5, ax * S, ay * S, bx2 * S, by2 * S));
      }
      if (d < stroke / 2) {
        const t = Math.min(1, fy * 1.3);
        r = mix(255, 196, t); gg = mix(255, 214, t); b = mix(255, 228, t);
      } else if (d < stroke / 2 + 1.2) { // 边缘柔化
        const a = (stroke / 2 + 1.2 - d) / 1.2;
        r = mix(r, 255, a * 0.7); gg = mix(gg, 255, a * 0.7); b = mix(b, 255, a * 0.7);
      }
      px[i] = Math.min(255, r) | 0;
      px[i + 1] = Math.min(255, gg) | 0;
      px[i + 2] = Math.min(255, b) | 0;
      px[i + 3] = 255;
    }
  }
  return pngEncode(S, S, px);
}

for (const [name, size, opts] of [
  ['icon-180.png', 180, {}],
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['maskable-512.png', 512, { maskable: true }],
]) {
  fs.writeFileSync(path.join(OUT, name), drawIcon(size, opts));
  console.log('wrote icons/' + name);
}

/**
 * 构建本地 Phosphor 图标集合（完全离线、自包含，摆脱对 api.iconify.design 的网络依赖）
 *
 * 背景：页面里大量使用 <span class="iconify" data-icon="ph:xxx"> 依赖 iconify.min.js (v2.2.1)
 * 在运行时向 api.iconify.design 拉取图标数据；服务端 CSP 为 connect-src 'self'，外部请求被拦截，
 * 且中国大陆访问该 CDN 不稳定，导致全局图标/SVG 全部空白。
 *
 * 方案：改为内联 SVG 注入。本脚本拉取全部 ph: 图标的 body，生成 public/vendor/ph-icons.js，
 * 内含 window.PH_ICONS（完整 <svg> 字符串）+ 一个自包含注入器（DOMContentLoaded 扫描 + MutationObserver 监听动态图标）。
 *
 * 产物加载方式（各 HTML <head>）：
 *   <script src="/vendor/ph-icons.js"></script>
 * 不再依赖 iconify.min.js。
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

async function fetchIcons(names) {
  const url = 'https://api.iconify.design/ph.json?icons=' + names.join(',');
  const res = await fetch(url, { headers: { 'User-Agent': 'xiangya-build/1.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text().catch(() => '')));
  return res.json();
}

function collectIconNames() {
  const names = new Set();
  // public/ 下各页面（HTML 静态 data-icon）
  const htmlFiles = ['admin.html', 'parent.html', 'student.html', 'teacher.html', 'agent.html', 'login.html'];
  for (const f of htmlFiles) {
    try {
      const s = readFileSync(join(root, 'public', f), 'utf8');
      for (const m of s.matchAll(/data-icon="ph:([a-z0-9-]+)"/g)) names.add(m[1]);
    } catch {}
  }
  // 原型/ 目录（独立演示原型，同样依赖 iconify，需一并离线化）
  for (const f of ['学生端.html', '家长端.html', '教师端.html', '管理端.html']) {
    try {
      const s = readFileSync(join(root, '原型', f), 'utf8');
      for (const m of s.matchAll(/data-icon="ph:([a-z0-9-]+)"/g)) names.add(m[1]);
    } catch {}
  }
  // 已打包 JS 里的动态 data-icon（模板字符串拼接等）——补抓所有 ph:xxx 字面量
  let jsFiles = [];
  try { jsFiles = readdirSync(join(root, 'public', 'assets', 'app')).filter((f) => f.endsWith('.js')); } catch {}
  for (const f of jsFiles) {
    const s = readFileSync(join(root, 'public', 'assets', 'app', f), 'utf8');
    for (const m of s.matchAll(/data-icon="ph:([a-z0-9-]+)"/g)) names.add(m[1]);
    for (const m of s.matchAll(/\bph:([a-z0-9-]{2,40})\b/g)) names.add(m[1]);
  }
  // ICONS 字典（src/frontend/core/icons.ts）里的键，兜底完整性
  try {
    const iconTs = readFileSync(join(root, 'src', 'frontend', 'core', 'icons.ts'), 'utf8');
    for (const m of iconTs.matchAll(/'ph:([a-z0-9-]+)'/g)) names.add(m[1]);
  } catch {}
  return [...names].sort();
}

async function main() {
  const list = collectIconNames();
  console.log('共收集图标名:', list.length);

  const svgMap = {};
  const missing = [];
  for (let i = 0; i < list.length; i += 300) {
    const batch = list.slice(i, i + 300);
    const data = await fetchIcons(batch);
    for (const [k, v] of Object.entries(data.icons || {})) {
      const body = v && typeof v.body === 'string' ? v.body : '';
      svgMap['ph:' + k] =
        "<svg xmlns='http://www.w3.org/2000/svg' width='1em' height='1em' viewBox='0 0 256 256' fill='currentColor'>" +
        body +
        '</svg>';
    }
    for (const n of data.not_found || []) missing.push(n);
  }
  if (missing.length) console.log('⚠ 官方库不存在（not_found）:', missing.join(', '));
  console.log('成功生成 SVG:', Object.keys(svgMap).length, '/', list.length);

  // 注入器源码（自包含，无外部依赖）
  const injector = `
/* ===== 本地图标注入器（自包含） ===== */
(function () {
  var ICONS = ${JSON.stringify(svgMap)};
  window.PH_ICONS = ICONS;

  function render(el) {
    var name = el.getAttribute('data-icon');
    if (!name || name.indexOf('ph:') !== 0) return;
    var first = el.firstElementChild;
    if (first && first.tagName && first.tagName.toLowerCase() === 'svg') return; // 已渲染
    var svg = ICONS[name];
    if (!svg) return;
    el.innerHTML = svg;
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    var els = root.querySelectorAll('.iconify[data-icon]');
    for (var i = 0; i < els.length; i++) render(els[i]);
  }

  function boot() { scan(document); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  if (window.MutationObserver) {
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var nodes = muts[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j];
          if (!n || n.nodeType !== 1) continue;
          if (n.matches && n.matches('.iconify[data-icon]')) render(n);
          if (n.querySelectorAll) scan(n);
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
`;

  const out = '/* 本地 Phosphor 图标集合（自动生成，请勿手改；重新生成：node scripts/build-ph-icons.mjs） */\n' + injector;
  mkdirSync(join(root, 'public', 'vendor'), { recursive: true });
  writeFileSync(join(root, 'public', 'vendor', 'ph-icons.js'), out, 'utf8');
  console.log('已写入 public/vendor/ph-icons.js (', out.length, 'bytes )');

  // ===== 同步内联到 原型/ 目录（自包含：双击 file:// 也能显示图标） =====
  const inlineBlock = '<script>\n' + injector + '\n</script>';
  const protoFiles = ['学生端.html', '家长端.html', '教师端.html', '管理端.html'];
  for (const f of protoFiles) {
    const p = join(root, '原型', f);
    try {
      let s = readFileSync(p, 'utf8');
      const cdnTag = '<script src="https://code.iconify.design/2/2.2.1/iconify.min.js"></script>';
      if (s.includes(cdnTag)) {
        s = s.replace(cdnTag, inlineBlock);
        writeFileSync(p, s, 'utf8');
        console.log('已内联图标脚本 → 原型/' + f);
      } else if (s.includes('iconify.min.js')) {
        console.log('⚠ 原型/' + f + ' 的 iconify 引用格式不同，需人工处理');
      } else {
        console.log('跳过（无需修改）: 原型/' + f);
      }
    } catch (e) {
      console.log('跳过（读取失败）: 原型/' + f, e.message);
    }
  }
}

main().catch((e) => {
  console.error('构建失败:', e.message);
  process.exit(1);
});

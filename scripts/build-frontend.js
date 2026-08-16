/**
 * 前端构建脚本（Node 环境）：
 * 1. 从 原型/*.html 抽取内联 <script> → public/assets/legacy/*.legacy.js（CSP 兼容前提）
 * 2. 自托管 vendor（iconify/echarts），去除 CDN 依赖
 * 3. 注入业务模块入口 <script type="module">
 * 4. 改写跨端链接（教师端.html → teacher.html 等）
 * 5. legacy 尾部追加"onclick 行为迁移"（CSP 会拦截内联事件处理器，改由 addEventListener 接管）
 *
 * 视觉结构/样式/布局零改动：仅交互代码载体变化。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROTO_DIR = path.join(ROOT, '原型');
const PUBLIC_DIR = path.join(ROOT, 'public');

const PAGE_MAP = {
  '教师端': { out: 'teacher', legacy: 'teacher', hasEcharts: true },
  '学生端': { out: 'student', legacy: 'student', hasEcharts: false },
  '家长端': { out: 'parent', legacy: 'parent', hasEcharts: false },
  '管理端': { out: 'admin', legacy: 'admin', hasEcharts: true },
};

/** onclick 迁移代码：CSP script-src 'self' 下内联事件处理器被拦截，
 *  此处统一以 addEventListener 接管（支持静态元素与动态注入元素）。 */
const ONCLICK_MIGRATION = `
/* ===== 由构建脚本注入：onclick 行为迁移（CSP 兼容层） ===== */
(function () {
  function bindExpr(el) {
    if (el.__boundOnclick) return;
    var expr = el.getAttribute('onclick');
    if (!expr) return;
    el.__boundOnclick = true;
    el.removeAttribute('onclick');
    var m = expr.match(/^\\s*([A-Za-z_$][\\w$]*)\\s*\\((.*)\\)\\s*;?\\s*$/);
    if (!m) return;
    var fn = window[m[1]];
    if (typeof fn !== 'function') return;
    var rawArgs = m[2] ? m[2].split(',') : [];
    var args = rawArgs.map(function (s) {
      s = s.trim();
      if (/^['"][\\s\\S]*['"]$/.test(s)) return { type: 'str', v: s.slice(1, -1) };
      if (s === 'this') return { type: 'this' };
      return { type: 'ident', v: s };
    });
    el.addEventListener('click', function (ev) {
      var real = args.map(function (a) {
        if (a.type === 'str') return a.v;
        if (a.type === 'this') return el;
        return window[a.v] !== undefined ? window[a.v] : a.v;
      });
      try { fn.apply(null, real); } catch (e) { /* 业务异常由统一层处理 */ }
    });
  }
  document.querySelectorAll('[onclick]').forEach(bindExpr);
  var mo = new MutationObserver(function (muts) {
    muts.forEach(function (mut) {
      mut.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        if (node.hasAttribute && node.hasAttribute('onclick')) bindExpr(node);
        node.querySelectorAll && node.querySelectorAll('[onclick]').forEach(bindExpr);
      });
    });
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
`;

function extractInlineScripts(html, legacyName) {
  const blocks = [];
  const replaced = html.replace(
    /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi,
    (match, body) => {
      blocks.push(body);
      return '';
    },
  );
  const legacy = blocks.join('\n;\n') + '\n' + ONCLICK_MIGRATION;
  fs.mkdirSync(path.join(PUBLIC_DIR, 'assets', 'legacy'), { recursive: true });
  fs.writeFileSync(path.join(PUBLIC_DIR, 'assets', 'legacy', `${legacyName}.legacy.js`), legacy, 'utf8');
  return replaced;
}

function build() {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  const loaded = fs.readFileSync(path.join(ROOT, 'scripts', 'echarts-loader.js'), 'utf8');
  fs.writeFileSync(path.join(PUBLIC_DIR, 'vendor', 'echarts-loader.js'), loaded, 'utf8');

  for (const [proto, cfg] of Object.entries(PAGE_MAP)) {
    const protoPath = path.join(PROTO_DIR, `${proto}.html`);
    if (!fs.existsSync(protoPath)) {
      console.error(`[skip] ${protoPath} 不存在`);
      continue;
    }
    let html = fs.readFileSync(protoPath, 'utf8');

    // 1. iconify CDN → 本地 vendor
    html = html.replace(
      /<script[^>]*src="https:\/\/code\.iconify\.design[^"]*"[^>]*><\/script>/i,
      '<script src="/vendor/iconify.min.js"></script>',
    );

    // 2. ECharts 多源回退加载块 → 本地 vendor 加载器
    if (cfg.hasEcharts) {
      const echartsLoaderRe = /<script>[\s\S]*?ECharts 多源回退加载[\s\S]*?<\/script>/i;
      const loaderMatch = html.match(echartsLoaderRe);
      if (loaderMatch) {
        html = html.replace(
          echartsLoaderRe,
          '<script src="/vendor/echarts.min.js"></script>\n<script src="/vendor/echarts-loader.js"></script>',
        );
      }
    }

    // 3. 抽取剩余内联脚本
    html = extractInlineScripts(html, cfg.legacy);
    html = html.replace(
      '</head>',
      `<script defer src="/assets/legacy/${cfg.legacy}.legacy.js"></script>\n</head>`,
    );

    // 4. 注入业务模块入口
    html = html.replace(
      '</body>',
      `<script type="module" src="/assets/app/${cfg.out}-main.js"></script>\n</body>`,
    );

    // 5. 跨端链接改写
    for (const [from, to] of Object.entries(PAGE_MAP)) {
      html = html.replace(new RegExp(`${from}\\.html`, 'g'), `${to}.html`);
    }

    fs.writeFileSync(path.join(PUBLIC_DIR, `${cfg.out}.html`), html, 'utf8');
    console.log(`[ok] ${proto}.html → public/${cfg.out}.html（${html.length} bytes）`);
  }
  console.log('[done] 前端构建完成');
}

build();
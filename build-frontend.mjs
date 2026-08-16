import { build } from 'esbuild';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;

/**
 * 安全说明：SIGNING_SECRET 是服务端密钥，绝不注入前端 bundle（可从 JS 提取）。
 * 防重放保护由服务端以 时间戳+一次性 Nonce 完成，浏览器端无需签名密钥。
 */
const secret = '';

const entries = ['login', 'teacher', 'student', 'parent', 'admin', 'agent'];

for (const name of entries) {
  await build({
    entryPoints: [join(__dirname, 'src', 'frontend', 'entries', name + '-main.ts')],
    bundle: true,
    format: 'iife',
    target: ['es2019'],
    outfile: join(root, 'public', 'assets', 'app', name + '-main.js'),
    define: { __SIGN_SECRET__: JSON.stringify(secret) },
    logLevel: 'silent',
    minify: false,
    sourcemap: false,
  });
  console.log('[build-frontend]', name + '-main.js done');
}
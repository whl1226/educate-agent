import { get, post, getCachedUser, saveLogin, redirectHome, homeOf, LoginResult } from '../core/request';
import { validateUsername, validatePassword, validateCaptcha } from '../core/validate';

const errs = {
  username: document.getElementById('err-username') as HTMLDivElement,
  password: document.getElementById('err-password') as HTMLDivElement,
  captcha: document.getElementById('err-captcha') as HTMLDivElement,
};
const captchaField = document.getElementById('captchaField') as HTMLDivElement;
const captchaBox = document.getElementById('captchaBox') as HTMLDivElement;
const captchaInput = document.getElementById('captcha') as HTMLInputElement;
const form = document.getElementById('loginForm') as HTMLFormElement;
const btn = document.getElementById('submitBtn') as HTMLButtonElement;

let needCaptcha = false;
let captchaId = '';
let failCount = 0;

function toast(msg: string): void {
  const t = document.getElementById('toast') as HTMLDivElement;
  t.textContent = msg;
  t.classList.add('on');
  window.setTimeout(() => t.classList.remove('on'), 2600);
}

function setErr(field: keyof typeof errs, msg: string): void {
  errs[field].textContent = msg;
}

async function loadCaptcha(): Promise<void> {
  try {
    const data = await get<{ id: string; svg: string }>('/auth/captcha', { noAuth: true, noRefresh: true });
    captchaId = data.id;
    captchaBox.innerHTML = data.svg;
    captchaInput.value = '';
  } catch {
    captchaBox.innerHTML = '<div style="padding:12px;font-size:12px;color:#999">验证码加载失败</div>';
  }
}

/** 预取 CSRF 凭证（服务端下发 XSRF-TOKEN Cookie，双提交模式必需） */
async function primeCsrf(): Promise<void> {
  try {
    await get('/auth/csrf', { noAuth: true, noRefresh: true });
  } catch {
    /* 网络异常时登录步骤会再次提示 */
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const u = (document.getElementById('username') as HTMLInputElement).value.trim();
  const p = (document.getElementById('password') as HTMLInputElement).value;
  const c = captchaInput.value.trim();

  const fe1 = validateUsername(u);
  const fe2 = validatePassword(p);
  const fe3 = needCaptcha ? validateCaptcha(c) : null;
  setErr('username', fe1 ? fe1.message : '');
  setErr('password', fe2 ? fe2.message : '');
  setErr('captcha', fe3 ? fe3.message : '');
  if (fe1 || fe2 || fe3) return;

  btn.disabled = true;
  btn.textContent = '登录中…';
  try {
    const body: Record<string, string> = { username: u, password: p };
    if (needCaptcha) {
      body.captchaId = captchaId;
      body.captchaAnswer = c;
    }
    const res = await post<LoginResult>('/auth/login', body, { noAuth: true, noRefresh: true });
    saveLogin(res);
    const r = sessionStorage.getItem('xy_redirect');
    sessionStorage.removeItem('xy_redirect');
    // 仅允许同源相对路径跳转（防开放重定向 / javascript: 注入）
    location.href = r && /^(\.{0,2}\/)?[A-Za-z0-9_-]+\.html(#[^"']*)?$/.test(r) ? r : homeOf(res.user.role);
  } catch (e: any) {
    failCount++;
    const code = e?.code || 0;
    if (code === 40002 || code === 40005 || code === 40006) {
      needCaptcha = true;
      captchaField.style.display = 'block';
      await loadCaptcha();
      setErr('captcha', '请输入验证码');
    }
    setErr('username', '');
    setErr('password', '');
    toast((e?.message || '登录失败，请稍后重试') + (failCount >= 3 ? '（连续失败将触发验证码）' : ''));
  } finally {
    btn.disabled = false;
    btn.textContent = '登 录';
  }
});

captchaBox.addEventListener('click', () => {
  if (needCaptcha) loadCaptcha();
});

(async () => {
  await primeCsrf();
  const cached = getCachedUser();
  if (cached) redirectHome(cached);
})();
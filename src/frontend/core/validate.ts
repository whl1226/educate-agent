export interface FieldError {
  field: string;
  message: string;
}

export function validateUsername(v: string): FieldError | null {
  if (!v.trim()) return { field: 'username', message: '请输入用户名' };
  if (v.trim().length < 2 || v.trim().length > 64)
    return { field: 'username', message: '用户名长度需在 2-64 之间' };
  if (!/^[\w\u4e00-\u9fa5.-]+$/.test(v.trim()))
    return { field: 'username', message: '用户名包含非法字符' };
  return null;
}

export function validatePassword(v: string): FieldError | null {
  if (!v) return { field: 'password', message: '请输入密码' };
  if (v.length < 6) return { field: 'password', message: '密码至少 6 位' };
  return null;
}

export function validateCaptcha(v: string): FieldError | null {
  if (!v.trim()) return { field: 'captcha', message: '请输入验证码' };
  if (v.trim().length > 8) return { field: 'captcha', message: '验证码格式不正确' };
  return null;
}
/**
 * 统一业务错误码
 * 约定：0 成功；4xxxx 客户端错误；5xxxx 服务端错误。
 * 对外输出仅为 code + message，绝不包含堆栈、数据库信息、内部路径。
 */
export const ErrorCodes = {
  SUCCESS: 0,

  VALIDATE_ERROR: 40001,
  METHOD_NOT_ALLOWED: 40002,
  RESOURCE_DEPRECATED: 40003,

  UNAUTHORIZED: 40101,
  TOKEN_EXPIRED: 40102,
  TOKEN_REVOKED: 40103,
  LOGIN_FAILED: 40104,
  ACCOUNT_LOCKED: 40105,
  CAPTCHA_REQUIRED: 40106,
  CAPTCHA_ERROR: 40107,
  OLD_PASSWORD_ERROR: 40108,
  RESET_TOKEN_INVALID: 40109,
  RESET_TOKEN_EXPIRED: 40110,
  ACCOUNT_DISABLED: 40111,

  FORBIDDEN: 40301,
  SCOPE_FORBIDDEN: 40302,
  CSRF_INVALID: 40303,
  REPLAY_DETECTED: 40304,
  TIMESTAMP_EXPIRED: 40305,

  NOT_FOUND: 40401,

  CONFLICT: 40901,
  ACCOUNT_EXISTS: 40902,

  RATE_LIMITED: 42901,
  LOGIN_RATE_LIMITED: 42902,

  INTERNAL_ERROR: 50001,
  AI_PROVIDER_UNAVAILABLE: 50301,
  FILE_TYPE_INVALID: 42201,
  FILE_TOO_LARGE: 42202,
  FILE_CONTENT_INVALID: 42203,
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const ErrorMessages: Record<number, string> = {
  [ErrorCodes.SUCCESS]: 'ok',
  [ErrorCodes.VALIDATE_ERROR]: '参数校验失败',
  [ErrorCodes.METHOD_NOT_ALLOWED]: '请求方法不允许',
  [ErrorCodes.RESOURCE_DEPRECATED]: '资源已下线',
  [ErrorCodes.UNAUTHORIZED]: '请先登录',
  [ErrorCodes.TOKEN_EXPIRED]: '登录已过期，请重新登录',
  [ErrorCodes.TOKEN_REVOKED]: '会话已失效，请重新登录',
  [ErrorCodes.LOGIN_FAILED]: '用户名或密码错误',
  [ErrorCodes.ACCOUNT_LOCKED]: '尝试次数过多，账号已锁定，请稍后再试',
  [ErrorCodes.CAPTCHA_REQUIRED]: '请先输入验证码',
  [ErrorCodes.CAPTCHA_ERROR]: '验证码错误或已过期',
  [ErrorCodes.OLD_PASSWORD_ERROR]: '原密码不正确',
  [ErrorCodes.RESET_TOKEN_INVALID]: '重置链接无效',
  [ErrorCodes.RESET_TOKEN_EXPIRED]: '重置链接已过期',
  [ErrorCodes.ACCOUNT_DISABLED]: '账号已被停用',
  [ErrorCodes.FORBIDDEN]: '没有操作权限',
  [ErrorCodes.SCOPE_FORBIDDEN]: '无权访问该数据',
  [ErrorCodes.CSRF_INVALID]: '安全校验失败，请刷新页面后重试',
  [ErrorCodes.REPLAY_DETECTED]: '请求已处理，请勿重复提交',
  [ErrorCodes.TIMESTAMP_EXPIRED]: '请求已过期，请重试',
  [ErrorCodes.NOT_FOUND]: '资源不存在',
  [ErrorCodes.CONFLICT]: '数据冲突',
  [ErrorCodes.ACCOUNT_EXISTS]: '账号已存在',
  [ErrorCodes.RATE_LIMITED]: '请求过于频繁，请稍后再试',
  [ErrorCodes.LOGIN_RATE_LIMITED]: '登录尝试过于频繁，请稍后再试',
  [ErrorCodes.INTERNAL_ERROR]: '系统繁忙，请稍后再试',
  [ErrorCodes.AI_PROVIDER_UNAVAILABLE]: 'AI 服务暂时不可用，请稍后再试',
  [ErrorCodes.FILE_TYPE_INVALID]: '不支持的文件类型',
  [ErrorCodes.FILE_TOO_LARGE]: '文件大小超出限制',
  [ErrorCodes.FILE_CONTENT_INVALID]: '文件内容与类型不符',
};

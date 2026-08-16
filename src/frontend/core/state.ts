export interface AppState {
  user: any;
  [k: string]: any;
}

const state: AppState = { user: null };

export function setState(k: string, v: any): void {
  state[k] = v;
}

export function getState<T = any>(k: string): T {
  return state[k] as T;
}

export function setUser(u: any): void {
  state.user = u;
}

export function getUser<T = any>(): T {
  return state.user as T;
}
import type { UserState, Task } from '../shared/domain';

export interface ApiResult { state: UserState; task?: Task; catId?: string; accountId?: string; today?: string; paymentReady?: boolean; rewarded?: boolean; recoveryCode?: string }
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api(path: string, method = 'GET', data?: unknown): Promise<ApiResult> {
  const isForm = data instanceof FormData;
  const response = await fetch(`/api${path}`, {
    method, credentials: 'same-origin',
    headers: data && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: data ? (isForm ? data : JSON.stringify(data)) : undefined,
  });
  let result: ApiResult & { error?: string };
  try { result = await response.json() as ApiResult & { error?: string }; } catch { throw new Error('无法连接服务，请确认 Cloudflare Worker 已启动'); }
  if (response.status === 401) window.dispatchEvent(new Event('meowAuthExpired'));
  if (!response.ok) throw new ApiError(result.error || '请求失败，请重试', response.status);
  return result;
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('shuttercat-proofs', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('photos');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('当前浏览器不能保存照片，请开启本地存储或选择云端保存'));
  });
}
export async function localPhoto(action: 'put' | 'get' | 'delete', id: string, blob?: Blob): Promise<Blob | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', action === 'get' ? 'readonly' : 'readwrite');
    const store = tx.objectStore('photos');
    const request = action === 'get' ? store.get(id) : action === 'put' ? store.put(blob, id) : store.delete(id);
    tx.oncomplete = () => { resolve(action === 'get' ? request.result : undefined); db.close(); };
    tx.onerror = () => { reject(new Error('照片保存失败，请检查设备剩余空间')); db.close(); };
  });
}

export async function clearLocalPhotos(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('shuttercat-proofs');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('本地照片删除失败，请在系统设置中清除 ShutterCat 存储数据'));
    request.onblocked = () => reject(new Error('本地照片正在使用，请关闭其他 ShutterCat 页面后重试'));
  });
}

export async function preparePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('请选择照片文件');
  if (file.size > 20 * 1024 * 1024) throw new Error('请选择 20 MB 以内的照片');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const ratio = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法处理这张照片');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('照片转换失败')), 'image/jpeg', 0.86));
  } catch { throw new Error('无法读取这张照片，请使用 JPG、PNG 或 WebP 格式'); }
  finally { URL.revokeObjectURL(url); }
}

export async function photoHash(blob: Blob): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('');
}

export interface NativeReply { authorized: boolean; selectedCount: number; locale?: string; guardEnabled?: boolean; serviceRunning?: boolean; lastSyncAt?: number; platform?: string; error?: string; bedtimeSupported?: boolean; bedtimeUntil?: number }
declare global {
  interface Window {
    MeowAndroid?: { postMessage: (message: string) => void };
    webkit?: { messageHandlers?: { meow?: { postMessage: (message: unknown) => void } } };
    meowNativeReply?: (reply: NativeReply) => void;
  }
}
export const isAndroid = () => Boolean(window.MeowAndroid);
export const isNative = () => isAndroid() || Boolean(window.webkit?.messageHandlers?.meow);
export const nativeMessage = (action: string, payload?: unknown) => {
  if (window.MeowAndroid) window.MeowAndroid.postMessage(JSON.stringify({ action, payload }));
  else window.webkit?.messageHandlers?.meow?.postMessage({ action, payload });
};

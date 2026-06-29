type InvokePayload = {
  data: unknown;
  error: { message?: string; name?: string; context?: unknown } | null;
};

function bodyDetail(data: unknown): string | null {
  if (data == null || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof o.statusCode === 'number') parts.push(`HTTP ${o.statusCode}`);
  if (typeof o.code === 'string' && o.code.trim()) parts.push(o.code.trim());
  if (typeof o.detail === 'string' && o.detail.trim()) parts.push(o.detail.trim());
  if (typeof o.error === 'string' && o.error.trim()) parts.push(o.error.trim());
  if (typeof o.message === 'string' && o.message.trim()) parts.push(o.message.trim());
  if (Array.isArray(o.failedCells) && o.failedCells.length > 0) {
    parts.push(`failedCells=${JSON.stringify(o.failedCells)}`);
  }
  return parts.length > 0 ? parts.join(' — ') : null;
}

function httpStatusFromContext(context: unknown): number | null {
  if (context == null || typeof context !== 'object') return null;
  const ctx = context as Record<string, unknown>;
  if (typeof ctx.status === 'number') return ctx.status;
  if (typeof ctx.statusCode === 'number') return ctx.statusCode;
  return null;
}

async function readContextBody(context: unknown): Promise<unknown> {
  if (context == null) return null;
  try {
    const ctx = context as Record<string, unknown>;
    if (typeof ctx.json === 'function') {
      return await (ctx.json as () => Promise<unknown>)();
    }
    if (typeof ctx.text === 'function') {
      const text = await (ctx.text as () => Promise<string>)();
      try { return JSON.parse(text); } catch { return { message: text }; }
    }
  } catch {
    // response body already consumed or not readable
  }
  return null;
}

export function formatEdgeFunctionFailure(fnName: string, { data, error }: InvokePayload): string {
  const parts: string[] = [`${fnName}`];
  const httpStatus = httpStatusFromContext(error?.context);
  if (httpStatus != null) parts.push(`HTTP ${httpStatus}`);
  if (error?.message) parts.push(error.message);
  const fromBody = bodyDetail(data);
  if (fromBody && fromBody !== error?.message) parts.push(fromBody);
  if (parts.length === 1) parts.push('Request failed with no error message from the server.');
  return parts.join(' — ');
}

export async function formatEdgeFunctionFailureAsync(
  fnName: string,
  { data, error }: InvokePayload,
): Promise<string> {
  const parts: string[] = [`${fnName}`];
  const httpStatus = httpStatusFromContext(error?.context);
  if (httpStatus != null) parts.push(`HTTP ${httpStatus}`);
  if (error?.message) parts.push(error.message);
  const contextBody = await readContextBody(error?.context);
  const detail = bodyDetail(contextBody) ?? bodyDetail(data);
  if (detail && detail !== error?.message) parts.push(detail);
  if (parts.length === 1) parts.push('Request failed with no error message from the server.');
  return parts.join(' — ');
}

export function logEdgeFunctionFailure(fnName: string, payload: InvokePayload): void {
  const msg = formatEdgeFunctionFailure(fnName, payload);
  const extra =
    payload.error && typeof payload.error === 'object'
      ? { name: payload.error.name, context: payload.error.context }
      : null;
  console.warn(`[edge-function] ${msg}`, { data: payload.data, errorFields: extra });
}

export async function logEdgeFunctionFailureAsync(
  fnName: string,
  payload: InvokePayload,
): Promise<string> {
  const msg = await formatEdgeFunctionFailureAsync(fnName, payload);
  console.warn(`[edge-function] ${msg}`, { data: payload.data });
  return msg;
}

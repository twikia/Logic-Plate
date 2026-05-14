type InvokePayload = {
  data: unknown;
  error: { message?: string; name?: string; context?: unknown } | null;
};

function bodyDetail(data: unknown): string | null {
  if (data == null || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (typeof o.detail === 'string' && o.detail.trim()) return o.detail.trim();
  if (typeof o.error === 'string' && o.error.trim()) return o.error.trim();
  if (typeof o.message === 'string' && o.message.trim()) return o.message.trim();
  return null;
}

export function formatEdgeFunctionFailure(fnName: string, { data, error }: InvokePayload): string {
  const parts: string[] = [`${fnName}`];
  if (error?.message) parts.push(error.message);
  const fromBody = bodyDetail(data);
  if (fromBody && fromBody !== error?.message) parts.push(fromBody);
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

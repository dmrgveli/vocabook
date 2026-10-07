export class NotFoundError extends Error {}

/** GET JSON with a timeout. Throws NotFoundError on 404 so callers can tell "no entry" from "service down". */
export async function getJson<T>(url: string, { timeoutMs = 6000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs)
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
  if (res.status === 404) throw new NotFoundError(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json() as Promise<T>
}

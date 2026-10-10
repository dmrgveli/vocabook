import { getAuthToken, SYNC_BASE } from '../sync/auth'

// Feedback from Settings, stored by the Worker (worker/src/feedback.ts).

declare const __BUILD_ID__: string

export type FeedbackKind = 'idea' | 'problem' | 'other'

export interface FeedbackItem {
  id: string
  at: string
  kind: FeedbackKind
  message: string
  page?: string
  version?: string
  device?: 'desktop' | 'phone'
  signedIn: boolean
}

export const feedbackAvailable = () => Boolean(SYNC_BASE)

async function headers(): Promise<Record<string, string>> {
  const token = await getAuthToken().catch(() => undefined)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function sendFeedback(kind: FeedbackKind, message: string, page: string): Promise<void> {
  const res = await fetch(`${SYNC_BASE}/v1/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await headers()) },
    body: JSON.stringify({ kind, message, page, version: __BUILD_ID__, device: matchMedia('(max-width: 899px)').matches ? 'phone' : 'desktop' }),
  })
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Feedback failed (${res.status})`)
}

/** The inbox, for the app's maintainers; undefined when this account may not read it. */
export async function readFeedback(): Promise<FeedbackItem[] | undefined> {
  const h = await headers()
  if (!h.Authorization) return undefined
  const res = await fetch(`${SYNC_BASE}/v1/feedback`, { headers: h })
  if (res.status === 403 || res.status === 401) return undefined
  if (!res.ok) throw new Error(`Inbox unavailable (${res.status})`)
  return ((await res.json()) as { items: FeedbackItem[] }).items
}

export async function deleteFeedback(id: string): Promise<void> {
  const res = await fetch(`${SYNC_BASE}/v1/feedback?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: await headers() })
  if (!res.ok) throw new Error(`Could not delete (${res.status})`)
}

// Feedback from the app's Settings, kept in R2 next to the notebooks.
//   POST   /v1/feedback          ← { kind, message, page?, version?, device? }  → { ok }
//          anyone using the app (its own origin), signed in or not; a daily cap keeps it sane
//   GET    /v1/feedback          → { items } newest first   (admins only: ADMIN_SUBS)
//   DELETE /v1/feedback?id=<id>  → { ok }                   (admins only)
// Nothing identifying is stored: no account, no e-mail, no IP; only whether the sender
// was signed in.

export interface FeedbackEnv {
  BUCKET: R2Bucket
  /** Comma-separated Google account ids (sub) allowed to read feedback. A Worker secret. */
  ADMIN_SUBS?: string
}

export const FEEDBACK_KINDS = ['idea', 'problem', 'other'] as const
export const MAX_MESSAGE = 2000
export const DAILY_FEEDBACK_CAP = 300
const PREFIX = 'feedback/items/'

export interface FeedbackItem {
  id: string
  at: string
  kind: (typeof FEEDBACK_KINDS)[number]
  message: string
  page?: string
  version?: string
  device?: 'desktop' | 'phone'
  signedIn: boolean
}

export class FeedbackError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}

const short = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : undefined)

export function parseFeedback(raw: unknown, signedIn: boolean, now = new Date()): FeedbackItem {
  if (!raw || typeof raw !== 'object') throw new FeedbackError('Bad feedback')
  const b = raw as Record<string, unknown>
  const kind = FEEDBACK_KINDS.find((k) => k === b.kind)
  const message = typeof b.message === 'string' ? b.message.trim() : ''
  if (!kind) throw new FeedbackError('Bad kind')
  if (!message || message.length > MAX_MESSAGE) throw new FeedbackError('Message must be 1–2000 characters')
  // newest first in R2's lexicographic listing: the key starts with the time counted backwards
  const back = String(9_999_999_999_999 - now.getTime()).padStart(13, '0')
  const id = `${back}-${crypto.randomUUID().slice(0, 8)}`
  return {
    id,
    at: now.toISOString(),
    kind,
    message,
    page: short(b.page, 120),
    version: short(b.version, 40),
    device: b.device === 'phone' || b.device === 'desktop' ? b.device : undefined,
    signedIn,
  }
}

export function isAdmin(env: FeedbackEnv, sub: string | undefined): boolean {
  if (!sub || !env.ADMIN_SUBS) return false
  return env.ADMIN_SUBS.split(',').map((s) => s.trim()).includes(sub)
}

export async function storeFeedback(env: FeedbackEnv, item: FeedbackItem): Promise<void> {
  const day = item.at.slice(0, 10)
  const countKey = `feedback/count/${day}.json`
  const used = ((await (await env.BUCKET.get(countKey))?.json()) as { n?: number } | null)?.n ?? 0
  if (used >= DAILY_FEEDBACK_CAP) throw new FeedbackError('Too much feedback today, try again tomorrow', 429)
  await env.BUCKET.put(countKey, JSON.stringify({ n: used + 1 }))
  await env.BUCKET.put(PREFIX + item.id, JSON.stringify(item), { httpMetadata: { contentType: 'application/json' } })
}

export async function listFeedback(env: FeedbackEnv, limit = 200): Promise<FeedbackItem[]> {
  const listed = await env.BUCKET.list({ prefix: PREFIX, limit })
  const items = await Promise.all(listed.objects.map(async (o) => (await (await env.BUCKET.get(o.key))?.json()) as FeedbackItem | null))
  return items.filter((x): x is FeedbackItem => !!x)
}

export async function deleteFeedback(env: FeedbackEnv, id: string): Promise<void> {
  if (!/^\d{13}-[0-9a-f]{8}$/.test(id)) throw new FeedbackError('Bad id')
  await env.BUCKET.delete(PREFIX + id)
}

import { AnimatePresence, motion } from 'motion/react'
import { Check, Copy, Inbox, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { deleteFeedback, feedbackAvailable, readFeedback, sendFeedback, type FeedbackItem, type FeedbackKind } from '../api/feedback'
import { useAuth } from '../sync/auth'

// Settings → Feedback: a short form for everyone, and, for the app's maintainers
// (accounts on the Worker's ADMIN_SUBS list), the inbox right below it.

const KINDS: { id: FeedbackKind; label: string }[] = [
  { id: 'idea', label: 'An idea' },
  { id: 'problem', label: 'Something is wrong' },
  { id: 'other', label: 'Something else' },
]
const MAX = 2000
const SEEN_KEY = 'feedback-seen'
const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export function FeedbackSettings() {
  const [kind, setKind] = useState<FeedbackKind>('idea')
  const [message, setMessage] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  if (!feedbackAvailable()) return <p className="muted">Feedback isn't set up for this copy of the app.</p>

  const send = async () => {
    const text = message.trim()
    if (!text) {
      setState('error')
      setError('Write a few words first.')
      return
    }
    setState('sending')
    try {
      await sendFeedback(kind, text, location.hash.slice(1) || '/')
      setMessage('')
      setState('sent')
    } catch (e) {
      setState('error')
      setError(e instanceof Error ? e.message : 'Could not send it right now.')
    }
  }

  return (
    <div className="stack feedback">
      <p className="muted">
        Tell us what works, what doesn't and what you'd like to see. It's read by the person making Vocabook. Nothing about you is sent: no
        e-mail, no account, only the text, the screen you were on and whether you use a phone or a computer.
      </p>
      <div className="feedback-kinds" role="radiogroup" aria-label="Kind of feedback">
        {KINDS.map((k) => (
          <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className="chip" onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="feedback-text">
        Your feedback
      </label>
      <textarea
        id="feedback-text"
        className="field feedback-text"
        rows={5}
        maxLength={MAX}
        placeholder={kind === 'problem' ? 'What happened, and where?' : 'Your idea or thought…'}
        value={message}
        onChange={(e) => {
          setMessage(e.target.value)
          if (state !== 'sending') setState('idle')
        }}
      />
      <div className="row feedback-actions">
        <span className="faint small">
          {message.length}/{MAX}
        </span>
        <AnimatePresence>
          {state === 'sent' && (
            <motion.span className="feedback-sent" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Check size={15} /> Thank you, it's on its way.
            </motion.span>
          )}
        </AnimatePresence>
        {state === 'error' && <span className="feedback-error small">{error}</span>}
        <button className="btn btn-marker" onClick={() => void send()} disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : 'Send feedback'}
        </button>
      </div>
      <FeedbackInbox />
    </div>
  )
}

/** The maintainers' inbox: newest first, unread marked, each one deletable. Hidden for everyone else. */
function FeedbackInbox() {
  const auth = useAuth()
  const signedIn = auth.status === 'signed-in' || auth.status === 'expired'
  const [items, setItems] = useState<FeedbackItem[] | null>()
  const [seen] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'))
    } catch {
      return new Set()
    }
  })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!signedIn) return
    readFeedback().then(
      (list) => setItems(list ?? null),
      () => setItems(null),
    )
  }, [signedIn])

  // Once shown, everything currently in the inbox counts as read next time.
  useEffect(() => {
    if (!items) return
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(items.map((i) => i.id)))
    } catch {
      // only the "new" marks are lost
    }
  }, [items])

  if (!signedIn) return null
  if (items === null)
    return (
      <details className="feedback-maintainer">
        <summary className="faint small">For the app's maintainer</summary>
        <p className="faint small">
          To read feedback here, add this account's ID to the Worker's <code>ADMIN_SUBS</code> secret:{' '}
          <code>{auth.user.sub}</code>{' '}
          <button
            className="icon-btn"
            aria-label="Copy account ID"
            onClick={() => {
              void navigator.clipboard?.writeText(auth.user.sub)
              setCopied(true)
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </p>
      </details>
    )
  if (items === undefined) return null

  const remove = async (id: string) => {
    await deleteFeedback(id)
    setItems((cur) => cur?.filter((i) => i.id !== id))
  }

  return (
    <section className="feedback-inbox">
      <h3 className="row">
        <Inbox size={17} /> Inbox <span className="faint">{items.length}</span>
      </h3>
      {items.length === 0 && <p className="faint small">No feedback yet.</p>}
      <ul>
        {items.map((i) => (
          <li key={i.id} className={seen.has(i.id) ? 'feedback-item' : 'feedback-item is-new'}>
            <div className="feedback-meta">
              <span className={`feedback-kind kind-${i.kind}`}>{KINDS.find((k) => k.id === i.kind)?.label}</span>
              <span className="faint small">
                {dateFormat.format(new Date(i.at))} · {i.device ?? 'unknown'} · {i.page ?? '/'} · {i.signedIn ? 'signed in' : 'guest'}
              </span>
              {!seen.has(i.id) && <span className="feedback-new">new</span>}
              <button className="icon-btn" aria-label="Delete this feedback" onClick={() => void remove(i.id)}>
                <Trash2 size={14} />
              </button>
            </div>
            <p className="feedback-message">{i.message}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

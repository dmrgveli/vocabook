import { AnimatePresence, motion } from 'motion/react'
import { CloudUpload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAppState } from '../app/state'
import type { Entry } from '../data/model'
import { useAuth } from '../sync/auth'
import { GoogleSignInButton } from './SyncStatus'

// For people who are not signed in: once their notebook reaches a handful of words, a
// gentle reminder that it lives only in this browser, with Google sign-in right there.
// It appears after adding a word (never when the app opens), at most once per visit,
// and "Don't remind me" turns it off for good.

export const BACKUP_PROMPT_MIN_WORDS = 5
const SHOWN_KEY = 'backup-prompt-shown'
const OFF_KEY = 'backup-prompt'

const read = (store: () => Storage, key: string) => {
  try {
    return store().getItem(key)
  } catch {
    return null
  }
}
const write = (store: () => Storage, key: string, value: string) => {
  try {
    store().setItem(key, value)
  } catch {
    // storage unavailable: the prompt may come back on the next visit
  }
}

export function BackupPrompt({ entries }: { entries: Entry[] | undefined }) {
  const auth = useAuth()
  const { quickAddOpen } = useAppState()
  const [open, setOpen] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const lastCount = useRef<number | undefined>(undefined)
  const count = entries?.length

  // A word was just added (the count went up while the app was open).
  useEffect(() => {
    if (count === undefined) return
    const grew = lastCount.current !== undefined && count > lastCount.current
    lastCount.current = count
    if (
      grew &&
      count >= BACKUP_PROMPT_MIN_WORDS &&
      auth.status === 'signed-out' &&
      read(() => sessionStorage, SHOWN_KEY) === null &&
      read(() => localStorage, OFF_KEY) !== 'off'
    )
      setWaiting(true)
  }, [count, auth.status])

  // Show it once the add dialog has closed, after the "added" toast has had a moment.
  useEffect(() => {
    if (!waiting || quickAddOpen) return
    const t = setTimeout(() => {
      write(() => sessionStorage, SHOWN_KEY, '1')
      setWaiting(false)
      setOpen(true)
    }, 1200)
    return () => clearTimeout(t)
  }, [waiting, quickAddOpen])

  // Signing in from the prompt closes it.
  useEffect(() => {
    if (auth.status === 'signed-in') setOpen(false)
  }, [auth.status])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay overlay-soft"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <motion.div
            className="dialog reminder backup-prompt"
            role="dialog"
            aria-modal="true"
            aria-labelledby="backup-title"
            initial={{ opacity: 0, y: 16, rotate: -1.5 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          >
            <button className="icon-btn reminder-close" onClick={() => setOpen(false)} aria-label="Close" autoFocus>
              <X size={18} />
            </button>
            <span className="backup-icon" aria-hidden>
              <CloudUpload size={26} />
            </span>
            <h2 id="backup-title" className="reminder-title">
              Keep your <span className="marked">{count} words</span> safe
            </h2>
            <p className="muted reminder-sub">
              Right now your notebook lives only in this browser. Clearing its data, or the browser tidying up storage on its own, would
              erase it. Sign in with Google to keep a backup and see your words on your other devices too.
            </p>
            <div className="backup-signin">
              <GoogleSignInButton />
            </div>
            <div className="dialog-actions reminder-actions">
              <button
                className="btn btn-quiet small"
                onClick={() => {
                  write(() => localStorage, OFF_KEY, 'off')
                  setOpen(false)
                }}
              >
                Don't remind me
              </button>
              <button className="btn" onClick={() => setOpen(false)}>
                Not now
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

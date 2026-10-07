import { AnimatePresence, motion } from 'motion/react'
import { Eye, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '../app/state'
import { markViewed } from '../data/db'
import type { Entry } from '../data/model'
import { wordPath } from '../data/paths'
import {
  alreadyShownThisVisit,
  markShownThisVisit,
  pickReminderWords,
  reminderHint,
  reminderSource,
  setRemindersEnabled,
  useRemindersEnabled,
} from '../data/reminders'
import { KBadge, SpeakButton } from './ui'

/** Once per app opening, a few words to look at again. Easy to dismiss; never in the way. */
export function ReminderPopup({ entries }: { entries: Entry[] | undefined }) {
  const enabled = useRemindersEnabled()
  const [words, setWords] = useState<Entry[]>()

  // Decide once, when the notebook first loads; later edits don't reopen it.
  useEffect(() => {
    if (!entries || words !== undefined || !enabled || alreadyShownThisVisit()) return
    const picked = pickReminderWords(entries)
    if (!picked) return
    markShownThisVisit()
    // a short pause so it doesn't land on top of the first paint
    const t = setTimeout(() => setWords(picked), 900)
    return () => clearTimeout(t)
  }, [entries, enabled, words])

  const close = () => setWords([])

  useEffect(() => {
    if (!words?.length) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [words])

  return (
    <AnimatePresence>
      {words && words.length > 0 && (
        <motion.div
          className="overlay overlay-soft"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
          <motion.div
            className="dialog reminder"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reminder-title"
            initial={{ opacity: 0, y: 16, rotate: 1.5 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          >
            <button className="icon-btn reminder-close" onClick={close} aria-label="Close" autoFocus>
              <X size={18} />
            </button>
            <h2 id="reminder-title" className="reminder-title">
              A page from your <span className="marked">notebook</span>
            </h2>
            <p className="muted reminder-sub">A few words you haven't looked at in a while. Do you still remember them?</p>

            <ul className="reminder-list">
              {words.map((w, i) => (
                <motion.li
                  key={w.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.12 + i * 0.05 }}
                >
                  <ReminderWord entry={w} onOpen={close} />
                </motion.li>
              ))}
            </ul>

            <div className="dialog-actions reminder-actions">
              <button
                className="btn btn-quiet small"
                onClick={() => {
                  setRemindersEnabled(false)
                  close()
                }}
              >
                Don't show these again
              </button>
              <button className="btn btn-marker" onClick={close}>
                Not now
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ReminderWord({ entry, onOpen }: { entry: Entry; onOpen: () => void }) {
  const navigate = useNavigate()
  const { toast } = useAppState()
  const [revealed, setRevealed] = useState(false)
  const hint = reminderHint(entry)
  const source = reminderSource(entry)

  return (
    <div className="reminder-word">
      <div className="reminder-word-head">
        <button
          className="word-font reminder-word-link"
          lang="en"
          onClick={() => {
            onOpen()
            navigate(wordPath(entry.word))
          }}
          title="Open this word"
        >
          {entry.word}
        </button>
        <SpeakButton text={entry.word} />
        <KBadge frequency={entry.frequency} plain />
        {source && <span className="faint small reminder-source">from {source}</span>}
      </div>
      {revealed ? (
        <motion.p className="reminder-hint" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
          {hint ?? 'No translation yet — open the word to add one.'}
        </motion.p>
      ) : (
        <button
          className="btn btn-quiet small reveal-btn"
          onClick={() => {
            setRevealed(true)
            // Looking at it counts as seeing it, so it rests before coming back.
            void markViewed(entry.id).catch(() => toast('Could not save that you saw this word'))
          }}
        >
          <Eye size={14} /> What did it mean?
        </button>
      )}
    </div>
  )
}

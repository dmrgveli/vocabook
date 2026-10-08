import { AnimatePresence, motion } from 'motion/react'
import { History, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { flashbackHistory, RESULT_LABEL, type PastRound } from '../data/flashback'
import type { Entry } from '../data/model'
import { localDay } from '../data/notebook'
import { wordPath } from '../data/paths'

const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

function when(iso: string): string {
  const yesterday = new Date(Date.now() - 864e5).toISOString()
  const d = localDay(iso)
  const label = d === localDay(new Date().toISOString()) ? 'Today' : d === localDay(yesterday) ? 'Yesterday' : day.format(new Date(iso))
  return `${label}, ${time.format(new Date(iso))}`
}

/** "History" in the Flashback header: past rounds and how each went. */
export function FlashbackHistoryButton({ entries }: { entries: Entry[] }) {
  const rounds = useMemo(() => flashbackHistory(entries), [entries])
  const [open, setOpen] = useState(false)
  const last = rounds[0]

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!last) return null
  return (
    <>
      <button className="btn btn-quiet history-btn" onClick={() => setOpen(true)} title="Past rounds">
        <History size={16} />
        <span className="history-btn-label">
          Last: {last.remembered}/{last.words.length}
        </span>
      </button>
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
              className="dialog reminder history-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="history-title"
              initial={{ opacity: 0, y: 16, rotate: 1 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            >
              <button className="icon-btn reminder-close" onClick={() => setOpen(false)} aria-label="Close" autoFocus>
                <X size={18} />
              </button>
              <h2 id="history-title" className="reminder-title">
                Past <span className="marked">rounds</span>
              </h2>
              <p className="muted reminder-sub">
                {rounds.length} {rounds.length === 1 ? 'round' : 'rounds'} so far. Tap a word to open it.
              </p>
              <ol className="history-list">
                {rounds.slice(0, 30).map((r, i) => (
                  <RoundRow key={r.at} round={r} latest={i === 0} onOpen={() => setOpen(false)} />
                ))}
              </ol>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function RoundRow({ round, latest, onOpen }: { round: PastRound; latest: boolean; onOpen: () => void }) {
  const share = round.words.length ? round.remembered / round.words.length : 0
  return (
    <li className="history-round" data-latest={latest}>
      <div className="history-round-head">
        <span className="mini-ring" style={{ '--pct': `${Math.round(share * 100)}%` } as React.CSSProperties}>
          <span>
            {round.remembered}/{round.words.length}
          </span>
        </span>
        <span>
          <strong>{latest ? 'Last round' : when(round.at)}</strong>
          {latest && <span className="faint small"> · {when(round.at)}</span>}
        </span>
      </div>
      <ul className="history-words">
        {round.words.map((w) => (
          <li key={w.entry.id} data-result={w.result} title={RESULT_LABEL[w.result]}>
            <Link to={wordPath(w.entry.word)} className="word-font" lang="en" onClick={onOpen}>
              {w.entry.word}
            </Link>
          </li>
        ))}
      </ul>
    </li>
  )
}

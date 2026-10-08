import { AnimatePresence, motion } from 'motion/react'
import { CornerDownLeft, Search, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '../app/state'
import { normalizeWord } from '../data/model'
import { lookPath } from '../data/paths'
import { useSuggestions } from '../hooks'
import { KBadge } from './ui'

/** Find any word and open its page without adding it to the notebook. */
export function LookUpDialog() {
  const { lookUpOpen, setLookUpOpen } = useAppState()
  const close = () => setLookUpOpen(false)
  return (
    <AnimatePresence>
      {lookUpOpen && (
        <motion.div
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
          <motion.div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Look up a word"
            initial={{ opacity: 0, y: -12, rotate: -1 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 460, damping: 30 }}
          >
            <LookUpForm onDone={close} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function LookUpForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [highlight, setHighlight] = useState(0)
  const suggestions = useSuggestions(input, true)
  const typed = normalizeWord(input)
  const options = typed && !suggestions.items.some((s) => s.word === typed) ? [...suggestions.items, { word: typed }] : suggestions.items

  useEffect(() => setHighlight(0), [suggestions.items])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDone()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  const open = (word: string) => {
    const w = normalizeWord(word)
    if (!w) return
    onDone()
    navigate(lookPath(w))
  }

  return (
    <div>
      <div className="palette-input">
        <Search size={20} className="faint" />
        <input
          lang="en"
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Look up any word…"
          aria-label="Word to look up"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHighlight((h) => Math.min(h + 1, options.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHighlight((h) => Math.max(h - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              open(options[highlight]?.word ?? typed)
            }
          }}
        />
        {suggestions.status === 'loading' && <span className="spinner" />}
      </div>
      {typed ? (
        <ul className="palette-options" role="listbox" aria-label="Suggestions">
          {suggestions.status === 'error' && (
            <li className="palette-note">
              <WifiOff size={14} /> Suggestions are unavailable right now.
            </li>
          )}
          {options.map((s, i) => (
            <li key={s.word}>
              <button type="button" role="option" aria-selected={i === highlight} onMouseEnter={() => setHighlight(i)} onClick={() => open(s.word)}>
                <span className="word-font option-word" lang="en">
                  {s.word}
                </span>
                {s.frequency === undefined ? <span className="faint">Look up as typed</span> : <KBadge word={s.word} plain />}
                {i === highlight && <CornerDownLeft size={14} className="faint" />}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="palette-hint faint small">Read about a word first; add it to your notebook only if you want to.</p>
      )}
    </div>
  )
}

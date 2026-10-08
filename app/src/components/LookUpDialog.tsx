import { AnimatePresence, motion } from 'motion/react'
import { CornerDownLeft, Search, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '../app/state'
import { normalizeWord, type Entry } from '../data/model'
import { lookPath, wordPath } from '../data/paths'
import { useEntries, useSuggestions } from '../hooks'
import { KBadge } from './ui'

/**
 * One search for both: words already in your notebook (by word or translation) come
 * first and open their page; any other word opens a look-up without adding it.
 */
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
            aria-label="Search or look up a word"
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

const MAX_OWN = 4

/** Notebook words matching the query: the word starts with it, then contains it, then the translation does. */
function matchOwn(entries: Entry[], q: string): Entry[] {
  if (!q) return []
  const score = (e: Entry) =>
    e.word.startsWith(q) ? 0 : e.word.includes(q) ? 1 : e.translation?.toLocaleLowerCase('tr').includes(q) ? 2 : -1
  return entries
    .map((e) => ({ e, s: score(e) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.e.word.localeCompare(b.e.word))
    .slice(0, MAX_OWN)
    .map((x) => x.e)
}

type Option = { kind: 'own'; entry: Entry } | { kind: 'look'; word: string; frequency?: number }

function LookUpForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const entries = useEntries()
  const [input, setInput] = useState('')
  const [highlight, setHighlight] = useState(0)
  const suggestions = useSuggestions(input, true)
  const typed = normalizeWord(input)

  const own = matchOwn(entries ?? [], typed)
  const ownWords = new Set(own.map((e) => e.word))
  const inNotebook = new Set((entries ?? []).map((e) => e.word))
  const look = suggestions.items.filter((s) => !inNotebook.has(s.word))
  if (typed && !inNotebook.has(typed) && !look.some((s) => s.word === typed)) look.push({ word: typed })
  const options: Option[] = [
    ...own.map((entry) => ({ kind: 'own' as const, entry })),
    ...look.filter((s) => !ownWords.has(s.word)).map((s) => ({ kind: 'look' as const, ...s })),
  ]

  useEffect(() => setHighlight(0), [suggestions.items, typed])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDone()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  const open = (o: Option | undefined) => {
    if (!o) return
    onDone()
    navigate(o.kind === 'own' ? wordPath(o.entry.word) : lookPath(o.word))
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
          placeholder="Your words or any word…"
          aria-label="Search your notebook or look up a word"
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
              open(options[highlight])
            }
          }}
        />
        {suggestions.status === 'loading' && <span className="spinner" />}
      </div>
      {typed ? (
        <ul className="palette-options" role="listbox" aria-label="Results">
          {options.map((o, i) => {
            const firstLook = o.kind === 'look' && (i === 0 || options[i - 1].kind === 'own')
            return (
              <li key={o.kind === 'own' ? o.entry.id : o.word}>
                {i === 0 && o.kind === 'own' && <p className="palette-group">In your notebook</p>}
                {firstLook && <p className="palette-group">Look up</p>}
                <button type="button" role="option" aria-selected={i === highlight} onMouseEnter={() => setHighlight(i)} onClick={() => open(o)}>
                  <span className="word-font option-word" lang="en">
                    {o.kind === 'own' ? o.entry.word : o.word}
                  </span>
                  {o.kind === 'own' ? (
                    <span className="faint small option-note">{o.entry.translation ?? 'Open'}</span>
                  ) : o.frequency === undefined ? (
                    <span className="faint">Look up as typed</span>
                  ) : (
                    <KBadge word={o.word} plain />
                  )}
                  {i === highlight && <CornerDownLeft size={14} className="faint" />}
                </button>
              </li>
            )
          })}
          {suggestions.status === 'error' && (
            <li className="palette-note">
              <WifiOff size={14} /> Suggestions are unavailable right now.
            </li>
          )}
        </ul>
      ) : (
        <p className="palette-hint faint small">Find a word in your notebook, or read about any word before deciding to add it.</p>
      )}
    </div>
  )
}

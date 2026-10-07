import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, CornerDownLeft, Search, WifiOff } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { enrichEntry } from '../api/enrich'
import type { Suggestion } from '../api/datamuse'
import { useAppState, type QuickAddPrefill } from '../app/state'
import { findByWord, putEntry, updateEntry } from '../data/db'
import { createEncounter, createEntry, normalizeWord, type Entry } from '../data/model'
import { allSources } from '../data/notebook'
import { wordPath } from '../data/paths'
import { useEntries, useSuggestions } from '../hooks'
import { SourceInput } from './SourceInput'
import { KBadge, SpeakButton } from './ui'

/** Command-palette style quick add. Goal: a new word in under 10 seconds. */
export function QuickAddDialog() {
  const { quickAddOpen, quickAddPrefill, closeQuickAdd } = useAppState()
  return (
    <AnimatePresence>
      {quickAddOpen && (
        <motion.div
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => e.target === e.currentTarget && closeQuickAdd()}
        >
          <motion.div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Add a word"
            initial={{ opacity: 0, y: -12, rotate: -1 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 460, damping: 30 }}
          >
            <QuickAddForm onDone={closeQuickAdd} prefill={quickAddPrefill} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function QuickAddForm({ onDone, prefill }: { onDone: () => void; prefill?: QuickAddPrefill }) {
  const navigate = useNavigate()
  const { toast } = useAppState()
  const entries = useEntries()
  const recent = useMemo(() => allSources(entries ?? []).slice(0, 5).map((s) => s.source), [entries])

  const [input, setInput] = useState('')
  const [picked, setPicked] = useState<Suggestion>()
  const [existing, setExisting] = useState<Entry>()
  const [highlight, setHighlight] = useState(0)
  const [source, setSource] = useState<string>()
  const [translation, setTranslation] = useState('')
  const [sentence, setSentence] = useState('')
  const [saving, setSaving] = useState(false)

  const suggestions = useSuggestions(input, !picked)
  const items = suggestions.items
  // The source starts as the last one used: adding several words in a row takes one keystroke.
  const sourceValue = source ?? recent[0] ?? ''

  useEffect(() => setHighlight(0), [items])
  // Opened with a word already chosen (from the word pop-up): go straight to the details.
  // Runs once, when the dialog opens.
  useEffect(() => {
    if (prefill) void pick(prefill)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDone()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  async function pick(s: Suggestion) {
    const word = normalizeWord(s.word)
    if (!word) return
    setPicked({ ...s, word })
    setInput(word)
    setExisting(await findByWord(word))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!picked || !sourceValue.trim() || saving) return
    setSaving(true)
    const encounter = createEncounter({ source: sourceValue, sentence })
    let id: string
    if (existing) {
      id = existing.id
      await updateEntry(id, (entry) => ({ ...entry, encounters: [...entry.encounters, encounter] }))
      toast(`New encounter added to “${existing.word}”`, { label: 'Open', run: () => navigate(wordPath(existing.word)) })
    } else {
      const entry = createEntry({ word: picked.word, frequency: picked.frequency, translation, encounter })
      id = entry.id
      await putEntry(entry)
      // Dictionary data is fetched in the background; the word is saved even if the APIs are down.
      enrichEntry(id).catch(() => undefined)
      toast(`“${entry.word}” added to your notebook`, { label: 'Open', run: () => navigate(wordPath(entry.word)) })
    }
    onDone()
  }

  const typed = normalizeWord(input)
  const showTyped = typed && !items.some((s) => s.word === typed)
  const options: Suggestion[] = showTyped ? [...items, { word: typed }] : items

  return (
    <form onSubmit={save}>
      <div className="palette-input">
        <Search size={20} className="faint" />
        <input
          lang="en"
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Type a word…"
          aria-label="Word"
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            if (picked) {
              setPicked(undefined)
              setExisting(undefined)
            }
          }}
          onKeyDown={(e) => {
            if (picked) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHighlight((h) => Math.min(h + 1, options.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHighlight((h) => Math.max(h - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const choice = options[highlight] ?? (typed ? { word: typed } : undefined)
              if (choice) pick(choice)
            }
          }}
        />
        {picked ? (
          <>
            <SpeakButton text={picked.word} />
            <KBadge word={picked.word} />
          </>
        ) : (
          suggestions.status === 'loading' && <span className="spinner" />
        )}
      </div>

      <AnimatePresence initial={false}>
        {!picked && typed && (
          <motion.ul
            key="options"
            className="palette-options"
            role="listbox"
            aria-label="Suggestions"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {suggestions.status === 'error' && (
              <li className="palette-note">
                <WifiOff size={14} /> Suggestions are unavailable right now — you can still add the word.
              </li>
            )}
            {options.map((s, i) => (
              <li key={s.word}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === highlight}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(s)}
                >
                  <span className="word-font option-word" lang="en">
                    {s.word}
                  </span>
                  {s.frequency === undefined ? <span className="faint">Add as typed</span> : <KBadge word={s.word} plain />}
                  {i === highlight && <CornerDownLeft size={14} className="faint" />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}

        {picked && (
          <motion.div
            key="details"
            className="palette-details stack"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {existing && (
              <div className="notice">
                <strong lang="en">{existing.word}</strong> is already in your notebook. Add this as a new encounter?
              </div>
            )}
            <SourceInput value={sourceValue} onChange={setSource} recent={recent} autoFocus />
            <div className={existing ? '' : 'two-col'}>
              {!existing && (
                <label className="label">
                  <span>
                    My translation <span className="optional">· optional</span>
                  </span>
                  <input className="field" lang="tr" value={translation} onChange={(e) => setTranslation(e.target.value)} />
                </label>
              )}
              <label className="label">
                <span>
                  Sentence it appeared in <span className="optional">· optional</span>
                </span>
                <input className="field" lang="en" value={sentence} onChange={(e) => setSentence(e.target.value)} />
              </label>
            </div>
            <div className="dialog-actions">
              <span className="faint hint">
                <kbd>Enter</kbd> to save · <kbd>Esc</kbd> to close
              </span>
              <button className="btn btn-marker" disabled={!sourceValue.trim() || saving}>
                {existing ? 'Add encounter' : 'Add to notebook'} <ArrowRight size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  )
}

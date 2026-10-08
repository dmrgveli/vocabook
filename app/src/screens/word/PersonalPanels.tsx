import { AnimatePresence, motion } from 'motion/react'
import { Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { SourceInput } from '../../components/SourceInput'
import { SpeakButton } from '../../components/ui'
import { alive, createEncounter, createNote, now, type Entry } from '../../data/model'
import { allSources } from '../../data/notebook'
import { useEntries } from '../../hooks'
import { Panel } from './Panel'

// The personal layer of a word page: where you met the word and your own notes.

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
export const formatDate = (d: string) => dateFormat.format(new Date(`${d.slice(0, 10)}T12:00:00`))

export type Update = (change: (e: Entry) => Entry) => Promise<unknown>

export function Encounters({ entry, update }: { entry: Entry; update: Update }) {
  const all = useEntries()
  const recent = useMemo(() => allSources(all ?? []).slice(0, 5).map((s) => s.source), [all])
  const [adding, setAdding] = useState(false)
  const [source, setSource] = useState('')
  const [sentence, setSentence] = useState('')
  const encounters = [...alive(entry.encounters)].sort((a, b) => a.date.localeCompare(b.date))

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!source.trim()) return
    const enc = createEncounter({ source, sentence })
    await update((x) => ({ ...x, encounters: [...x.encounters, enc] }))
    setAdding(false)
    setSource('')
    setSentence('')
  }

  const remove = (id: string) =>
    update((x) => ({
      ...x,
      encounters: x.encounters.map((enc) => (enc.id === id ? { ...enc, deletedAt: now(), updatedAt: now() } : enc)),
    }))

  return (
    <Panel
      title={`Encounters · ${encounters.length}`}
      delay={0.15}
      aside={
        !adding && (
          <button className="icon-btn" onClick={() => setAdding(true)} aria-label="Add encounter" title="Add encounter">
            <Plus size={16} />
          </button>
        )
      }
    >
      <ol className="timeline">
        <AnimatePresence initial={false}>
          {encounters.map((enc, i) => (
            <motion.li
              key={enc.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="timeline-head">
                <strong>{enc.source}</strong>
                <span className="faint">
                  {formatDate(enc.date)}
                  {i === 0 && ' · first met'}
                </span>
                <button
                  className="icon-btn hover-only"
                  aria-label="Delete encounter"
                  onClick={() => confirm('Delete this encounter?') && remove(enc.id)}
                >
                  <X size={14} />
                </button>
              </div>
              {enc.sentence && (
                <blockquote lang="en">
                  <span className="word-font">
                    <Highlighted text={enc.sentence} word={entry.word} />
                  </span>{' '}
                  <SpeakButton text={enc.sentence} label="Read the sentence aloud" />
                </blockquote>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>

      <AnimatePresence>
        {adding && (
          <motion.form
            className="stack inset-form"
            onSubmit={add}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <SourceInput value={source} onChange={setSource} recent={recent} autoFocus />
            <input
              className="field"
              lang="en"
              placeholder="Sentence it appeared in (optional)"
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
            />
            <div className="row">
              <button className="btn btn-marker" disabled={!source.trim()}>
                Add encounter
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </Panel>
  )
}

/** Highlights the word inside a sentence. Always rendered as plain text. */
function Highlighted({ text, word }: { text: string; word: string }) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(\\b${escaped}\\w*)`, 'gi'))
  return <>{parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : p))}</>
}

/** Short personal notes: associations, look-alikes, reminders. Hidden behind a button until used. */
export function Notes({ notes, update }: { notes: Entry['notes']; update: Update }) {
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    const note = createNote(draft)
    await update((x) => ({ ...x, notes: [...x.notes, note] }))
    setDraft('')
  }

  const remove = (id: string) =>
    update((x) => ({ ...x, notes: x.notes.map((n) => (n.id === id ? { ...n, deletedAt: now(), updatedAt: now() } : n)) }))

  if (notes.length === 0 && !open)
    return (
      <button className="btn add-note" onClick={() => setOpen(true)}>
        <Plus size={15} /> Add a note
      </button>
    )

  return (
    <Panel title="Notes" delay={0.05}>
      <AnimatePresence initial={false}>
        {notes.map((n) => (
          <motion.p
            key={n.id}
            className="margin-note word-font"
            layout
            initial={{ opacity: 0, rotate: -1, y: 6 }}
            animate={{ opacity: 1, rotate: 0, y: 0 }}
            exit={{ opacity: 0, height: 0, margin: 0 }}
          >
            <span>{n.text}</span>
            <button className="icon-btn hover-only" aria-label="Delete note" onClick={() => remove(n.id)}>
              <X size={14} />
            </button>
          </motion.p>
        ))}
      </AnimatePresence>
      <form onSubmit={add}>
        <input
          className="field"
          placeholder="An association, a look-alike word, a reminder…"
          aria-label="New note"
          autoFocus={notes.length === 0}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => !draft.trim() && notes.length === 0 && setOpen(false)}
        />
      </form>
    </Panel>
  )
}

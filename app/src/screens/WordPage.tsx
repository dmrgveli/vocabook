import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, CloudOff, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { enrichEntry, isEnriching } from '../api/enrich'
import { useAppState } from '../app/state'
import { EditableText } from '../components/EditableText'
import { SourceInput } from '../components/SourceInput'
import { KBadge, MasteryControl, RecordingButton, SpeakButton } from '../components/ui'
import { YouGlishPanel } from '../components/YouGlishPanel'
import { deleteEntry, markViewed, updateEntry } from '../data/db'
import { describeK, frequencyK } from '../data/frequency'
import { alive, createEncounter, createNote, now, type Enrichment, type Entry } from '../data/model'
import { allSources } from '../data/notebook'
import { useEntries, useEntry } from '../hooks'
import { speak } from '../speech'

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const formatDate = (d: string) => dateFormat.format(new Date(`${d.slice(0, 10)}T12:00:00`))

type Update = (change: (e: Entry) => Entry) => Promise<unknown>

export function WordPage() {
  const { id } = useParams()
  const entry = useEntry(id)

  useEffect(() => {
    document.querySelector('.main')?.scrollTo(0, 0)
    if (id) markViewed(id)
  }, [id])

  if (entry === undefined) return <div className="page" />
  if (entry === null)
    return (
      <div className="page">
        <BackLink />
        <p className="muted">This word is not in your notebook.</p>
      </div>
    )
  return <WordPageContent key={entry.id} entry={entry} />
}

function BackLink() {
  return (
    <Link to="/" className="btn btn-quiet back-link">
      <ArrowLeft size={16} /> Notebook
    </Link>
  )
}

function WordPageContent({ entry }: { entry: Entry }) {
  const navigate = useNavigate()
  const { toast } = useAppState()
  const update: Update = (change) => updateEntry(entry.id, change)
  const e = entry.enrichment

  async function remove() {
    if (!confirm(`Remove “${entry.word}” from your notebook?`)) return
    await deleteEntry(entry.id)
    toast(`“${entry.word}” removed`)
    navigate('/')
  }

  return (
    <div className="page word-page">
      <BackLink />

      <header className="word-hero">
        <div className="word-hero-main">
          <motion.div
            className="word-title-row"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          >
            <h1 className="word-font word-title" lang="en">
              {entry.word}
            </h1>
            <motion.span
              initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 14, delay: 0.15 }}
            >
              <KBadge frequency={entry.frequency} large />
            </motion.span>
          </motion.div>
          <div className="row word-meta">
            <SpeakButton text={entry.word} size="lg" />
            <SpeakButton text={entry.word} size="lg" slow />
            {e?.audioUrl && <RecordingButton url={e.audioUrl} word={entry.word} />}
            {e?.phonetic && <span className="phonetic-lg">{e.phonetic}</span>}
            {frequencyK(entry.frequency) !== undefined && <span className="faint">{describeK(frequencyK(entry.frequency)!)}</span>}
          </div>
        </div>
        <div className="word-hero-side">
          <span className="label-sm">How well do you know it?</span>
          <MasteryControl value={entry.mastery} onChange={(m) => update((x) => ({ ...x, mastery: m }))} />
          <span className="faint">Added {formatDate(entry.createdAt)}</span>
        </div>
      </header>

      <div className="word-columns">
        <div className="word-col">
          <Dictionary entry={entry} />
        </div>

        <div className="word-col">
          <Panel title="My translation" delay={0.05}>
            <EditableText
              label="My translation"
              lang="tr"
              className="edit-lg"
              value={entry.translation}
              placeholder="Write it in your own words…"
              onSave={(v) => update((x) => ({ ...x, translation: v }))}
            />
          </Panel>

          <Panel title="My sentence" delay={0.1} aside={entry.ownSentence && <SpeakButton text={entry.ownSentence} label="Read my sentence aloud" />}>
            <EditableText
              label="My sentence"
              lang="en"
              multiline
              value={entry.ownSentence}
              placeholder="Try using it in a sentence from your own life."
              onSave={(v) => update((x) => ({ ...x, ownSentence: v }))}
            />
          </Panel>

          <Encounters entry={entry} update={update} />
          <MarginNotes notes={alive(entry.notes)} update={update} />
          <Tags tags={entry.tags} update={update} />

          <button className="btn btn-quiet btn-danger remove-btn" onClick={remove}>
            <Trash2 size={15} /> Remove from notebook
          </button>
        </div>
      </div>
    </div>
  )
}

function Panel({ title, children, delay = 0, aside }: { title: string; children: React.ReactNode; delay?: number; aside?: React.ReactNode }) {
  return (
    <motion.section
      className="panel box"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 + delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="panel-head">
        <h2 className="label-sm">{title}</h2>
        {aside}
      </div>
      {children}
    </motion.section>
  )
}

/* ---------- dictionary (automatic layer) ---------- */

function Dictionary({ entry }: { entry: Entry }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>(isEnriching(entry.id) ? 'loading' : 'idle')
  const e = entry.enrichment

  const fetchNow = () => {
    setStatus('loading')
    enrichEntry(entry.id).then(
      () => setStatus('idle'),
      () => setStatus('error'),
    )
  }

  // Words added while offline get their dictionary data the first time they are opened;
  // data saved before the collocation filter existed (no `adjectives`) is refreshed too.
  useEffect(() => {
    if (!entry.enrichment || !entry.enrichment.collocations.adjectives) fetchNow()
  }, [entry.id])

  const refresh = (
    <button className="icon-btn" onClick={fetchNow} disabled={status === 'loading'} title="Fetch again" aria-label="Fetch dictionary data again">
      <RefreshCw size={14} className={status === 'loading' ? 'spin' : ''} />
    </button>
  )

  if (!e) {
    return (
      <Panel title="Definitions">
        {status === 'error' ? (
          <div className="offline">
            <CloudOff size={18} />
            <div>
              <p>The dictionary services can't be reached right now.</p>
              <button className="btn" onClick={fetchNow}>
                <RefreshCw size={14} /> Try again
              </button>
            </div>
          </div>
        ) : (
          <DefinitionSkeleton />
        )}
      </Panel>
    )
  }

  return (
    <>
      <Panel title="Definitions" aside={refresh}>
        <Definitions enrichment={e} />
        {e.definitionsFrom === 'datamuse' && (
          <p className="source-note faint">Definitions from Datamuse — Free Dictionary was unavailable or had no entry.</p>
        )}
      </Panel>

      {hasCollocations(e.collocations) && (
        <Panel title="Used together with" delay={0.05}>
          <Collocations word={entry.word} collocations={e.collocations} />
        </Panel>
      )}

      <Panel title="Hear it in real videos" delay={0.08}>
        <YouGlishPanel word={entry.word} />
      </Panel>

      {(e.synonyms.length > 0 || e.antonyms.length > 0) && (
        <Panel title="Related words" delay={0.1}>
          {e.synonyms.length > 0 && <WordChips label="Similar" words={e.synonyms} />}
          {e.antonyms.length > 0 && <WordChips label="Opposite" words={e.antonyms} />}
        </Panel>
      )}

      {e.origin && (
        <Panel title="Origin" delay={0.15}>
          <p className="muted">{e.origin}</p>
        </Panel>
      )}
    </>
  )
}

function Definitions({ enrichment }: { enrichment: Enrichment }) {
  if (enrichment.meanings.length === 0) return <p className="faint">No definitions found for this word.</p>
  return (
    <div className="meanings">
      {enrichment.meanings.map((m) => (
        <div key={m.partOfSpeech} className="meaning">
          <span className="pos">{m.partOfSpeech}</span>
          <ol>
            {m.definitions.slice(0, 4).map((d, i) => (
              <li key={i}>
                <span>{d.definition}</span>
                {d.example && (
                  <span className="example" lang="en">
                    <span className="word-font">“{d.example}”</span> <SpeakButton text={d.example} label="Read the example aloud" />
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}

function DefinitionSkeleton() {
  return (
    <div className="stack" aria-label="Loading definitions">
      <span className="skeleton" style={{ width: 70, height: 18 }} />
      <span className="skeleton" style={{ width: '92%', height: 14 }} />
      <span className="skeleton" style={{ width: '78%', height: 14 }} />
      <span className="skeleton" style={{ width: '85%', height: 14 }} />
    </div>
  )
}

type CollocationSet = Enrichment['collocations']

function hasCollocations(c: CollocationSet): boolean {
  return c.before.length + c.after.length + (c.adjectives?.length ?? 0) + (c.nouns?.length ?? 0) > 0
}

/** Phrases built from Datamuse's most frequent neighbours; each one can be read aloud. */
function Collocations({ word, collocations: c }: { word: string; collocations: CollocationSet }) {
  const groups: { label: string; phrases: [string, string][] }[] = [
    { label: 'Described as', phrases: (c.adjectives ?? []).map((w) => [w, word]) },
    { label: 'Describes', phrases: (c.nouns ?? []).map((w) => [word, w]) },
    { label: 'Comes after', phrases: c.before.map((w) => [w, word]) },
    { label: 'Followed by', phrases: c.after.map((w) => [word, w]) },
  ]
  return (
    <div className="collocations">
      {groups
        .filter((g) => g.phrases.length > 0)
        .map((g) => (
          <div key={g.label}>
            <span className="faint coll-label">{g.label}</span>
            <div className="row" style={{ gap: 6 }}>
              {g.phrases.map(([a, b]) => (
                <button key={`${a} ${b}`} type="button" className="coll" lang="en" onClick={() => speak(`${a} ${b}`)} title="Say it">
                  {a === word ? <b>{a}</b> : <span>{a}</span>} {b === word ? <b>{b}</b> : <span>{b}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
    </div>
  )
}

function WordChips({ label, words }: { label: string; words: string[] }) {
  return (
    <div className="word-chips">
      <span className="faint coll-label">{label}</span>
      <div className="row" style={{ gap: 6 }}>
        {words.map((w) => (
          <span key={w} className="chip" lang="en">
            {w}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---------- personal layer ---------- */

function Encounters({ entry, update }: { entry: Entry; update: Update }) {
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

function MarginNotes({ notes, update }: { notes: Entry['notes']; update: Update }) {
  const [draft, setDraft] = useState('')

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    const note = createNote(draft)
    await update((x) => ({ ...x, notes: [...x.notes, note] }))
    setDraft('')
  }

  const remove = (id: string) =>
    update((x) => ({ ...x, notes: x.notes.map((n) => (n.id === id ? { ...n, deletedAt: now(), updatedAt: now() } : n)) }))

  return (
    <Panel title="Margin notes" delay={0.2}>
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
          placeholder="An association, a similar word, a reminder…"
          aria-label="New margin note"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </form>
    </Panel>
  )
}

function Tags({ tags, update }: { tags: string[]; update: Update }) {
  const [draft, setDraft] = useState('')

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const tag = draft.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-')
    if (!tag || tags.includes(tag)) return setDraft('')
    await update((x) => ({ ...x, tags: [...x.tags, tag] }))
    setDraft('')
  }

  return (
    <Panel title="Tags" delay={0.25}>
      <form className="row" onSubmit={add} style={{ gap: 6 }}>
        <AnimatePresence initial={false}>
          {tags.map((t) => (
            <motion.button
              key={t}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              type="button"
              className="chip"
              aria-label={`Remove tag ${t}`}
              onClick={() => update((x) => ({ ...x, tags: x.tags.filter((y) => y !== t) }))}
            >
              #{t} <X size={12} />
            </motion.button>
          ))}
        </AnimatePresence>
        <input
          className="field tag-input"
          placeholder="+ add tag"
          aria-label="New tag"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </form>
    </Panel>
  )
}

import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ChevronUp, CloudOff, Play, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { enrichEntry, isEnriching } from '../api/enrich'
import { useAppState } from '../app/state'
import { EditableText } from '../components/EditableText'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { SourceInput } from '../components/SourceInput'
import { KBadge, MasteryControl, RecordingButton, SpeakButton } from '../components/ui'
import { LinkedText, PeekWord } from '../components/WordPeek'
import { YouGlishPanel } from '../components/YouGlishPanel'
import { deleteEntry, markViewed, updateEntry } from '../data/db'
import { alive, createEncounter, createNote, isEnrichmentCurrent, now, type Collocation, type Enrichment, type Entry } from '../data/model'
import { allSources } from '../data/notebook'
import { parseWordParam, wordPath } from '../data/paths'
import { useEntries, useEntryAt } from '../hooks'
import { speak } from '../speech'

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const formatDate = (d: string) => dateFormat.format(new Date(`${d.slice(0, 10)}T12:00:00`))

type Update = (change: (e: Entry) => Entry) => Promise<unknown>

export function WordPage() {
  const { param } = useParams()
  const entry = useEntryAt(param)
  const navigate = useNavigate()

  useEffect(() => {
    document.querySelector('.main')?.scrollTo(0, 0)
  }, [param])

  useEffect(() => {
    if (!entry) return
    void markViewed(entry.id)
    // Old links used the entry id; show the readable address instead.
    if (param && 'id' in parseWordParam(param)) navigate(wordPath(entry.word), { replace: true })
  }, [entry?.id])

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
  const [videosOpen, setVideosOpen] = useState(false)

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
              className="title-badges"
              initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 14, delay: 0.15 }}
            >
              <KBadge frequency={entry.frequency} large />
              <button
                type="button"
                className="video-badge"
                aria-expanded={videosOpen}
                aria-controls="word-videos"
                onClick={() => setVideosOpen((o) => !o)}
              >
                {videosOpen ? <ChevronUp size={15} strokeWidth={2.5} /> : <Play size={14} strokeWidth={2.5} fill="currentColor" />}
                {videosOpen ? 'Hide videos' : 'Hear it used'}
              </button>
            </motion.span>
          </motion.div>
          <div className="row word-meta">
            <SpeakButton text={entry.word} size="lg" />
            <SpeakButton text={entry.word} size="lg" slow />
            {e?.audioUrl && <RecordingButton url={e.audioUrl} word={entry.word} />}
            {e?.phonetic && <span className="phonetic-lg">{e.phonetic}</span>}
          </div>
        </div>
        <div className="word-hero-side">
          <span className="label-sm">How well do you know it?</span>
          <MasteryControl value={entry.mastery} onChange={(m) => update((x) => ({ ...x, mastery: m }))} />
          <span className="faint">Added {formatDate(entry.createdAt)}</span>
        </div>
      </header>

      <AnimatePresence initial={false}>
        {videosOpen && (
          <motion.section
            id="word-videos"
            className="videos-drawer"
            aria-label={`“${entry.word}” in real videos`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="videos-inner box">
              <ErrorBoundary fallback={<p className="faint">The videos stopped working. Close and open them again.</p>}>
                <YouGlishPanel word={entry.word} />
              </ErrorBoundary>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

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
          <Notes notes={alive(entry.notes)} update={update} />

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
  // data stored in an older layout is refreshed the same way.
  useEffect(() => {
    if (!isEnrichmentCurrent(entry.enrichment)) fetchNow()
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
        <Definitions enrichment={e} word={entry.word} />
        {e.definitionsFrom === 'datamuse' && (
          <p className="source-note faint">Definitions from Datamuse — Free Dictionary was unavailable or had no entry.</p>
        )}
      </Panel>

      {hasCollocations(e.collocations) && (
        <Panel title="Used together with" delay={0.05}>
          <Collocations word={entry.word} collocations={e.collocations} />
        </Panel>
      )}

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

function Definitions({ enrichment, word }: { enrichment: Enrichment; word: string }) {
  if (enrichment.meanings.length === 0) return <p className="faint">No definitions found for this word.</p>
  return (
    <div className="meanings">
      {enrichment.meanings.map((m) => (
        <div key={m.partOfSpeech} className="meaning">
          <span className="pos">{m.partOfSpeech}</span>
          <ol>
            {m.definitions.slice(0, 4).map((d, i) => (
              <li key={i}>
                <span>
                  <LinkedText text={d.definition} skip={word} />
                </span>
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

/** Entries fetched before scores existed stored plain strings. */
const asCollocation = (c: Collocation | string): Collocation => (typeof c === 'string' ? { word: c } : c)

function hasCollocations(c: CollocationSet): boolean {
  return c.before.length + c.after.length > 0
}

/**
 * The most frequent neighbours on each side, most common first. The bar shows how often
 * each pair occurs compared with the most frequent pair in its column (Datamuse scores).
 */
function Collocations({ word, collocations: c }: { word: string; collocations: CollocationSet }) {
  const columns = [
    { label: 'Comes after', hint: `Words that often come right before “${word}”`, items: c.before.map(asCollocation), phrase: (w: string) => [w, word] },
    { label: 'Comes before', hint: `Words that often come right after “${word}”`, items: c.after.map(asCollocation), phrase: (w: string) => [word, w] },
  ].filter((col) => col.items.length > 0)

  return (
    <div className="collocations">
      {columns.map((col) => {
        const top = Math.max(...col.items.map((i) => i.score ?? 0))
        return (
          <div key={col.label} className="coll-column">
            <span className="faint coll-label" title={col.hint}>
              {col.label}
            </span>
            <ol className="coll-list">
              {col.items.map((item) => {
                const [a, b] = col.phrase(item.word)
                const share = top && item.score ? item.score / top : undefined
                return (
                  <li key={item.word}>
                    <button type="button" className="coll-row" lang="en" onClick={() => speak(`${a} ${b}`)} title={`Say “${a} ${b}”`}>
                      <span className="coll-phrase">
                        {a === word ? <b>{a}</b> : <span>{a}</span>} {b === word ? <b>{b}</b> : <span>{b}</span>}
                      </span>
                      {share !== undefined && (
                        <span
                          className="coll-bar"
                          title={share === 1 ? 'The most frequent pair' : `About ${Math.max(1, Math.round(share * 100))}% as frequent as the top pair`}
                        >
                          <span style={{ width: `${Math.max(4, share * 100)}%` }} />
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        )
      })}
    </div>
  )
}

function WordChips({ label, words }: { label: string; words: string[] }) {
  return (
    <div className="word-chips">
      <span className="faint coll-label">{label}</span>
      <div className="row" style={{ gap: 6 }}>
        {words.map((w) => (
          <PeekWord key={w} word={w} chip />
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

/** Short personal notes: associations, look-alikes, reminders. Hidden behind a button until used. */
function Notes({ notes, update }: { notes: Entry['notes']; update: Update }) {
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

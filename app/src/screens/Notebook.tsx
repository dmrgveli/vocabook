import { motion } from 'motion/react'
import { Plus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAppState } from '../app/state'
import { MOD_KEY } from '../components/Sidebar'
import { KBadge, MasteryMeter, SpeakButton, toneClass } from '../components/ui'
import { K_BANDS } from '../data/frequency'
import { alive, MASTERY_LABELS, type Entry } from '../data/model'
import { EMPTY_FILTERS, entrySource, filterEntries, groupByDay, hasActiveFilters, localDay } from '../data/notebook'

const dayFormat = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
const yearFormat = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

function formatDay(day: string) {
  const date = new Date(`${day}T12:00:00`)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (day === localDay(new Date().toISOString())) return 'Today'
  if (day === localDay(yesterday.toISOString())) return 'Yesterday'
  return date.getFullYear() === new Date().getFullYear() ? dayFormat.format(date) : yearFormat.format(date)
}

export function Notebook({ entries }: { entries: Entry[] }) {
  const { filters, setFilters, openQuickAdd } = useAppState()
  const searchRef = useRef<HTMLInputElement>(null)
  const pages = useMemo(() => groupByDay(filterEntries(entries, filters)), [entries, filters])
  const shown = pages.reduce((n, p) => n + p.entries.length, 0)
  const thisWeek = useMemo(() => entries.filter((e) => Date.parse(e.createdAt) > Date.now() - 7 * 864e5).length, [entries])

  // "/" focuses search, as in most desktop apps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target as HTMLElement).closest('input, textarea')) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (entries.length === 0) return <EmptyNotebook onAdd={openQuickAdd} />

  const activeChips = [
    filters.band && { key: 'band', label: K_BANDS.find((b) => b.id === filters.band)!.label },
    filters.mastery && { key: 'mastery', label: MASTERY_LABELS[filters.mastery] },
    filters.source && { key: 'source', label: filters.source },
    filters.tag && { key: 'tag', label: `#${filters.tag}` },
  ].filter(Boolean) as { key: keyof typeof filters; label: string }[]

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">
          My <span className="marked">notebook</span>
        </h1>
        <p className="muted">
          {entries.length} {entries.length === 1 ? 'word' : 'words'}
          {thisWeek > 0 && <> · {thisWeek} this week</>}
        </p>
      </header>

      <div className="toolbar">
        <label className="search">
          <Search size={17} className="faint" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search words, translations, notes…"
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            aria-label="Search the notebook"
          />
          <kbd>/</kbd>
        </label>
        {activeChips.map((c) => (
          <motion.button
            key={c.key}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            className="chip"
            aria-pressed="true"
            onClick={() => setFilters((f) => ({ ...f, [c.key]: undefined }))}
          >
            {c.label} <X size={13} />
          </motion.button>
        ))}
        {hasActiveFilters(filters) && (
          <span className="faint result-count">
            {shown} of {entries.length}
            <button className="btn btn-quiet" onClick={() => setFilters(() => EMPTY_FILTERS)}>
              Clear
            </button>
          </span>
        )}
      </div>

      {pages.length === 0 ? (
        <p className="muted no-results">No words match these filters.</p>
      ) : (
        pages.map(({ day, entries }, pageIndex) => (
          <section key={day} className="day">
            <h2 className="day-title">
              {formatDay(day)} <span className="faint">{entries.length}</span>
            </h2>
            <div className="card-grid">
              {entries.map((e, i) => (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, y: 10, rotate: i % 2 ? 1.2 : -1.2 }}
                  animate={{ opacity: 1, y: 0, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 26, delay: Math.min(pageIndex * 0.04 + i * 0.03, 0.35) }}
                >
                  <WordCard entry={e} />
                </motion.div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function WordCard({ entry }: { entry: Entry }) {
  const source = entrySource(entry)
  const encounters = alive(entry.encounters).length
  const definition = entry.enrichment?.meanings[0]?.definitions[0]?.definition
  return (
    <article className={`word-card ${toneClass(entry.frequency)}`}>
      <div className="word-card-head">
        {/* the link stretches over the whole card; the speak button sits above it */}
        <Link to={`/word/${entry.id}`} className="word-font word-card-word card-link" lang="en">
          {entry.word}
        </Link>
        <KBadge frequency={entry.frequency} />
      </div>
      <div className="row word-card-sub">
        <SpeakButton text={entry.word} />
        {entry.enrichment?.phonetic && <span className="phonetic">{entry.enrichment.phonetic}</span>}
      </div>
      {entry.translation ? (
        <p className="word-card-translation">{entry.translation}</p>
      ) : definition ? (
        <p className="word-card-definition">{definition}</p>
      ) : null}
      <div className="word-card-foot">
        <span className="word-card-source">
          {source}
          {encounters > 1 && <span className="encounter-count">×{encounters}</span>}
        </span>
        <MasteryMeter level={entry.mastery} />
      </div>
    </article>
  )
}

function EmptyNotebook({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="page empty-state">
      <motion.div
        className="empty-card"
        initial={{ opacity: 0, y: 16, rotate: -2 }}
        animate={{ opacity: 1, y: 0, rotate: -1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      >
        <span className="empty-glyph word-font">Aa</span>
        <h1>
          Your notebook is <span className="marked">empty</span>
        </h1>
        <p className="muted">
          Add the first word you stumbled on — in a show, a book or a meeting. Where you met it is all you need; the rest can wait.
        </p>
        <button className="btn btn-marker" onClick={onAdd}>
          <Plus size={16} strokeWidth={2.5} /> Add your first word <kbd>{MOD_KEY} K</kbd>
        </button>
      </motion.div>
    </div>
  )
}

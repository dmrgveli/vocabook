import { motion } from 'motion/react'
import { ArrowRight, ArrowUpDown, BookOpenText, History, LayoutGrid, List, NotebookText, Plus, Rows3, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppState } from '../app/state'
import { MOD_KEY } from '../components/Sidebar'
import { KBadge, MasteryMeter, SpeakButton, toneClass } from '../components/ui'
import { GuestWordsOffer } from '../components/GuestWords'
import { useWordPreview, WordPreview } from '../components/WordPreview'
import { RuledPage } from './notebook/RuledPage'
import { FLASHBACK_MIN_WORDS } from '../data/flashback'
import { bandOfWord, K_BANDS, levelOf, MAX_LEVEL, useLevelsReady } from '../data/levels'
import { metEncounters, MASTERY_LABELS, normalizeWord, type Entry, type Mastery } from '../data/model'
import { lookPath, wordPath } from '../data/paths'
import {
  EMPTY_FILTERS,
  entrySource,
  filterEntries,
  groupEntries,
  GROUPS,
  hasActiveFilters,
  localDay,
  sortEntries,
  SORTS,
  type GroupKey,
  type SortKey,
} from '../data/notebook'

const dayFormat = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
const yearFormat = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const weekdayFormat = new Intl.DateTimeFormat('en-US', { weekday: 'long' })
const shortDayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const shortYearFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function formatDay(day: string) {
  const date = new Date(`${day}T12:00:00`)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (day === localDay(new Date().toISOString())) return 'Today'
  if (day === localDay(yesterday.toISOString())) return 'Yesterday'
  return date.getFullYear() === new Date().getFullYear() ? dayFormat.format(date) : yearFormat.format(date)
}

/** The margin of the ruled page is narrow: "Thursday / Oct 8", "Today / Oct 9". */
function marginLabel(group: GroupKey, key: string): { title: string; sub?: string } {
  if (group !== 'day') return { title: groupTitle(group, key) }
  const date = new Date(`${key}T12:00:00`)
  const title = formatDay(key)
  const thisYear = date.getFullYear() === new Date().getFullYear()
  const sub = (thisYear ? shortDayFormat : shortYearFormat).format(date)
  return title === 'Today' || title === 'Yesterday' ? { title, sub } : { title: weekdayFormat.format(date), sub }
}

function groupTitle(group: GroupKey, key: string): string {
  switch (group) {
    case 'day':
      return formatDay(key)
    case 'source':
      return key || 'No source'
    case 'level':
      return K_BANDS.find((b) => b.id === key)?.label ?? 'Level unknown'
    case 'mastery':
      return MASTERY_LABELS[key as Mastery]
    default:
      return ''
  }
}

/** Levels as numbers for sorting; words off the lists come right after 25K. */
const numericLevel = (word: string) => {
  const l = levelOf(word)
  return l === undefined ? undefined : l.level === 'off' ? MAX_LEVEL + 1 : l.level
}

type Layout = 'page' | 'lines' | 'cards'

interface NotebookView {
  sort: SortKey
  group: GroupKey
  /** page: the ruled notebook page, everything written out; lines: one ruled line per word; cards: the colourful cards */
  layout: Layout
}

const VIEW_KEY = 'notebook-view'
const DEFAULT_VIEW: NotebookView = { sort: 'newest', group: 'day', layout: 'page' }
const LAYOUTS: Layout[] = ['page', 'lines', 'cards']

/** Before the ruled page (9 Oct 2026) the layouts were cards / compact: everyone starts on the page once. */
function savedLayout(saved: { layout?: string; layoutVersion?: number }): Layout {
  if (saved.layoutVersion === 2 && LAYOUTS.includes(saved.layout as Layout)) return saved.layout as Layout
  return saved.layout === 'compact' ? 'lines' : 'page'
}

/** Sort and grouping, remembered on this device. */
function useNotebookView(): [NotebookView, (v: NotebookView) => void] {
  const [view, setViewState] = useState<NotebookView>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null')
      const valid = saved && SORTS.some((s) => s.id === saved.sort) && GROUPS.some((g) => g.id === saved.group)
      return valid ? { sort: saved.sort, group: saved.group, layout: savedLayout(saved) } : DEFAULT_VIEW
    } catch {
      return DEFAULT_VIEW
    }
  })
  const setView = (v: NotebookView) => {
    setViewState(v)
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({ ...v, layoutVersion: 2 }))
    } catch {
      // storage unavailable: the choice lasts until the page closes
    }
  }
  return [view, setView]
}

export function Notebook({ entries }: { entries: Entry[] }) {
  const { filters, setFilters, openQuickAdd, setLookUpOpen } = useAppState()
  const searchRef = useRef<HTMLInputElement>(null)
  // Card colours and the "how common" filter come from the BNC/COCA table, which loads in the background.
  const levelsReady = useLevelsReady()
  const [view, setView] = useNotebookView()
  const preview = useWordPreview()
  const pages = useMemo(
    () => groupEntries(sortEntries(filterEntries(entries, filters), view.sort, numericLevel), view.group, bandOfWord),
    [entries, filters, view, levelsReady],
  )
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

  if (entries.length === 0) return <EmptyNotebook onAdd={() => openQuickAdd()} onLookUp={() => setLookUpOpen(true)} />

  const activeChips = [
    filters.band && { key: 'band', label: K_BANDS.find((b) => b.id === filters.band)!.label },
    filters.mastery && { key: 'mastery', label: MASTERY_LABELS[filters.mastery] },
    filters.source && { key: 'source', label: filters.source },
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
        {entries.length >= FLASHBACK_MIN_WORDS && (
          <Link to="/flashback" className="btn flashback-cta">
            <History size={16} /> Flashback
          </Link>
        )}
      </header>

      <GuestWordsOffer />

      <div className="toolbar">
        <label className="search">
          <Search size={17} className="faint" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search your notebook or look up a word…"
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            aria-label="Search the notebook"
          />
          <kbd>/</kbd>
        </label>
        <span className="layout-toggle" role="group" aria-label="Layout">
          <button aria-pressed={view.layout === 'page'} onClick={() => setView({ ...view, layout: 'page' })} title="Notebook page" aria-label="Notebook page">
            <NotebookText size={16} />
          </button>
          <button
            aria-pressed={view.layout === 'lines'}
            onClick={() => setView({ ...view, layout: 'lines' })}
            title="One line per word"
            aria-label="One line per word"
          >
            <List size={16} />
          </button>
          <button aria-pressed={view.layout === 'cards'} onClick={() => setView({ ...view, layout: 'cards' })} title="Cards" aria-label="Cards">
            <LayoutGrid size={16} />
          </button>
        </span>

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
        <span className="view-controls">
          <label className="select-chip" title="Sort">
            <ArrowUpDown size={14} />
            <select value={view.sort} onChange={(e) => setView({ ...view, sort: e.target.value as SortKey })} aria-label="Sort words">
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="select-chip" title="Group">
            <Rows3 size={14} />
            <select value={view.group} onChange={(e) => setView({ ...view, group: e.target.value as GroupKey })} aria-label="Group words">
              {GROUPS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.id === 'none' ? g.label : `By ${g.label.toLowerCase()}`}
                </option>
              ))}
            </select>
          </label>
        </span>
        {hasActiveFilters(filters) && (
          <span className="faint result-count">
            {shown} of {entries.length}
            <button className="btn btn-quiet" onClick={() => setFilters(() => EMPTY_FILTERS)}>
              Clear
            </button>
          </span>
        )}
      </div>

      <LookUpHint query={filters.query} entries={entries} />

      {pages.length === 0 ? (
        <p className="muted no-results">No words in your notebook match.</p>
      ) : view.layout !== 'cards' ? (
        <RuledPage
          groups={pages}
          detail={view.layout === 'page' ? 'full' : 'brief'}
          margin={view.group === 'none' ? undefined : (key) => marginLabel(view.group, key)}
          preview={preview}
        />
      ) : (
        pages.map(({ key, entries }, pageIndex) => (
          <section key={`${view.group}:${key}`} className="day">
            {view.group !== 'none' && (
              <h2 className="day-title">
                {groupTitle(view.group, key)} <span className="faint">{entries.length}</span>
              </h2>
            )}
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
      {view.layout === 'lines' && <WordPreview target={preview.target} />}
    </div>
  )
}

/** Searching for a word you don't have yet: offer to look it up in the dictionary. */
function LookUpHint({ query, entries }: { query: string; entries: Entry[] }) {
  const word = normalizeWord(query)
  // single words or short phrases only, and not one already in the notebook
  if (!word || word.length > 40 || !/^[a-z][a-z' -]*$/i.test(word) || entries.some((e) => e.word === word)) return null
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
      <Link to={lookPath(word)} className="lookup-hint">
        <BookOpenText size={17} />
        <span>
          Look up <strong className="word-font">{word}</strong> in the dictionary
        </span>
        <ArrowRight size={16} className="lookup-hint-arrow" />
      </Link>
    </motion.div>
  )
}

function WordCard({ entry }: { entry: Entry }) {
  const source = entrySource(entry)
  const encounters = metEncounters(entry).length
  const definition = entry.enrichment?.meanings[0]?.definitions[0]?.definition
  return (
    <article className={`word-card ${toneClass(entry.word)}`}>
      <div className="word-card-head">
        {/* the link stretches over the whole card; the speak button sits above it */}
        <Link to={wordPath(entry.word)} className="word-font word-card-word card-link" lang="en">
          {entry.word}
        </Link>
        <KBadge word={entry.word} />
      </div>
      <div className="row word-card-sub">
        <SpeakButton text={entry.word} />
        {entry.enrichment?.phonetic && <span className="phonetic">{entry.enrichment.phonetic}</span>}
      </div>
      {entry.translation ? (
        <p className="word-card-translation clamp">{entry.translation}</p>
      ) : definition ? (
        <p className="word-card-definition clamp">{definition}</p>
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

function EmptyNotebook({ onAdd, onLookUp }: { onAdd: () => void; onLookUp: () => void }) {
  return (
    <div className="page empty-state">
      <GuestWordsOffer />
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
        <button className="btn btn-quiet" onClick={onLookUp}>
          <Search size={16} /> Or just look up a word
        </button>
      </motion.div>
    </div>
  )
}

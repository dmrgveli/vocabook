import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Plus } from 'lucide-react'
import { Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isFunctionWord, peek, type Peek } from '../api/datamuse'
import { useAppState } from '../app/state'
import { findByWord } from '../data/db'
import type { Entry } from '../data/model'
import { wordPath } from '../data/paths'
import { KBadge, SpeakButton } from './ui'

// A small card about any word you click in a definition or in the related words:
// base form, how common it is, pronunciation and one short definition, plus a way to
// add it to the notebook. It closes when the pointer moves well away from it.

const WIDTH = 300
const GAP = 8
/** How far (px) the pointer may wander from the card and the clicked word before it closes. */
const CLOSE_DISTANCE = 90

interface PeekState {
  word: string
  anchor: HTMLElement
}

let current: PeekState | null = null
const listeners = new Set<() => void>()
const set = (next: PeekState | null) => {
  current = next
  listeners.forEach((l) => l())
}

export function openPeek(word: string, anchor: HTMLElement) {
  set(current?.anchor === anchor ? null : { word, anchor })
}

export function closePeek() {
  if (current) set(null)
}

function usePeekState() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

/** A clickable word that opens the pop-up. */
export function PeekWord({ word, children, chip }: { word: string; children?: ReactNode; chip?: boolean }) {
  return (
    <button
      type="button"
      className={chip ? 'chip peek-chip' : 'peek-word'}
      lang="en"
      // Inline words would add dozens of tab stops to a definition; chips stay reachable.
      tabIndex={chip ? 0 : -1}
      onClick={(e) => openPeek(word, e.currentTarget)}
    >
      {children ?? word}
    </button>
  )
}

/** Plain text where every content word can be clicked for a quick look. */
export function LinkedText({ text, skip }: { text: string; skip?: string }) {
  const parts = text.split(/([A-Za-z][A-Za-z'-]*[A-Za-z]|[A-Za-z])/)
  return (
    <>
      {parts.map((part, i) => {
        const lower = part.toLowerCase()
        const linkable = i % 2 === 1 && part.length > 2 && !isFunctionWord(lower) && lower !== skip
        return linkable ? <PeekWord key={i} word={lower}>{part}</PeekWord> : <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}

function distanceToRect(x: number, y: number, r: DOMRect) {
  const dx = Math.max(r.left - x, 0, x - r.right)
  const dy = Math.max(r.top - y, 0, y - r.bottom)
  return Math.hypot(dx, dy)
}

/** Rendered once, in the app shell. */
export function WordPeek() {
  const state = usePeekState()
  const location = useLocation()

  // A new page means the clicked word is gone.
  useEffect(() => closePeek(), [location.pathname])

  return <AnimatePresence>{state && <PeekCard key={state.word + state.anchor.textContent} state={state} />}</AnimatePresence>
}

function PeekCard({ state }: { state: PeekState }) {
  const card = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { openQuickAdd } = useAppState()
  const [info, setInfo] = useState<Peek | 'error'>()
  const [inNotebook, setInNotebook] = useState<Entry>()
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>()

  useEffect(() => {
    let active = true
    peek(state.word).then(
      async (p) => {
        if (!active) return
        setInfo(p)
        const entry = await findByWord(p.word)
        if (active) setInNotebook(entry)
      },
      () => active && setInfo('error'),
    )
    return () => {
      active = false
    }
  }, [state.word])

  // Below the word, or above it when there's no room; never off the sides.
  useLayoutEffect(() => {
    const r = state.anchor.getBoundingClientRect()
    const height = card.current?.offsetHeight ?? 160
    const left = Math.min(Math.max(r.left + r.width / 2 - WIDTH / 2, 12), window.innerWidth - WIDTH - 12)
    setPos(
      r.bottom + GAP + height > window.innerHeight - 12
        ? { left, bottom: window.innerHeight - r.top + GAP }
        : { left, top: r.bottom + GAP },
    )
  }, [state.anchor, info])

  // Close when the pointer moves far away, on Escape, on a click elsewhere or on scroll.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!card.current) return
      const near = Math.min(
        distanceToRect(e.clientX, e.clientY, card.current.getBoundingClientRect()),
        distanceToRect(e.clientX, e.clientY, state.anchor.getBoundingClientRect()),
      )
      if (near > CLOSE_DISTANCE) closePeek()
    }
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!card.current?.contains(target) && !state.anchor.contains(target)) closePeek()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closePeek()
    const onScroll = () => closePeek()
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [state.anchor])

  const p = info && info !== 'error' ? info : undefined

  return (
    <motion.div
      ref={card}
      className="peek"
      role="dialog"
      aria-label={`About “${p?.word ?? state.word}”`}
      style={{ width: WIDTH, left: pos?.left ?? -9999, top: pos?.top, bottom: pos?.bottom }}
      initial={{ opacity: 0, y: pos?.bottom !== undefined ? 6 : -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }}
    >
      <div className="peek-head">
        <span className="word-font peek-word-title" lang="en">
          {p?.word ?? state.word}
        </span>
        <SpeakButton text={p?.word ?? state.word} />
        {p && <KBadge frequency={p.frequency} plain />}
      </div>

      {info === undefined && (
        <div className="stack" style={{ gap: 6, marginTop: 8 }}>
          <span className="skeleton" style={{ width: '60%', height: 12 }} />
          <span className="skeleton" style={{ width: '90%', height: 12 }} />
        </div>
      )}
      {info === 'error' && <p className="faint small peek-text">Couldn't look this word up right now.</p>}
      {p && (
        <>
          {(p.ipa || p.partOfSpeech || p.form) && (
            <p className="faint small peek-meta">
              {p.partOfSpeech && <span className="peek-pos">{p.partOfSpeech}</span>}
              {p.ipa && <span>{p.ipa}</span>}
              {p.form && <span>from “{p.form}”</span>}
            </p>
          )}
          <p className="peek-text">{p.definition ?? <span className="faint">No short definition found.</span>}</p>
        </>
      )}

      {p && (
        <div className="peek-actions">
          {inNotebook ? (
            <button
              className="btn btn-quiet small"
              onClick={() => {
                closePeek()
                navigate(wordPath(inNotebook.word))
              }}
            >
              In your notebook <ArrowRight size={14} />
            </button>
          ) : (
            <button
              className="btn small peek-add"
              onClick={() => {
                closePeek()
                openQuickAdd({ word: p.word, frequency: p.frequency })
              }}
            >
              <Plus size={14} /> Add to notebook
            </button>
          )}
        </div>
      )}
    </motion.div>
  )
}

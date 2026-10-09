import { motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MASTERY_LABELS, metEncounters, type Entry } from '../data/model'
import { entrySource, lineSentence, topPhrases } from '../data/notebook'
import { KBadge, MasteryMeter, toneClass } from './ui'

// Desktop only: resting the pointer on a word in the one-line-per-word notebook opens a card
// with its details right at the pointer, and the card follows it along the line. It is a
// preview, not a control: the line itself opens the page.

const HOVER_QUERY = '(hover: hover) and (min-width: 900px)'
const OPEN_DELAY_MS = 320
const WIDTH = 320
const GAP = 12
/** how far the card sits from the pointer, so it never covers what is under it */
const OFFSET = 18

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export interface PreviewTarget {
  entry: Entry
  /** pointer position */
  x: number
  y: number
}

/** Hover handlers for the rows, and the target currently previewed. */
export function useWordPreview() {
  const [target, setTarget] = useState<PreviewTarget>()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pointer = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (!target) return
    const close = () => setTarget(undefined)
    // scrolling moves the row away from its preview
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [target])
  useEffect(() => () => clearTimeout(timer.current), [])

  const handlers = (entry: Entry) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      if (!matchMedia(HOVER_QUERY).matches) return
      pointer.current = { x: e.clientX, y: e.clientY }
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setTarget({ entry, ...pointer.current }), OPEN_DELAY_MS)
    },
    onMouseMove: (e: React.MouseEvent<HTMLElement>) => {
      pointer.current = { x: e.clientX, y: e.clientY }
      setTarget((t) => (t && t.entry.id === entry.id ? { entry, ...pointer.current } : t))
    },
    onMouseLeave: () => {
      clearTimeout(timer.current)
      setTarget(undefined)
    },
  })
  return { target, handlers }
}

export function WordPreview({ target }: { target?: PreviewTarget }) {
  if (!target) return null
  return createPortal(<PreviewCard key={target.entry.id} target={target} />, document.body)
}

function PreviewCard({ target: { entry, x, y } }: { target: PreviewTarget }) {
  const ref = useRef<HTMLDivElement>(null)
  // below and to the right of the pointer; to its left or above it where the screen ends
  const left = x + OFFSET + WIDTH + GAP < innerWidth ? x + OFFSET : Math.max(GAP, x - OFFSET - WIDTH)
  const [top, setTop] = useState(y + OFFSET)

  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0
    setTop(y + OFFSET + h + GAP < innerHeight ? y + OFFSET : Math.max(GAP, y - OFFSET - h))
  }, [x, y])

  const e = entry.enrichment
  const definitions = (e?.meanings ?? []).slice(0, 2)
  const encounters = metEncounters(entry).length
  const source = entrySource(entry)
  const phrases = topPhrases(entry)
  const sentence = lineSentence(entry)

  return (
    <motion.div
      ref={ref}
      className={`word-preview ${toneClass(entry.word)}`}
      style={{ left, top, width: WIDTH, pointerEvents: 'none' }}
      initial={{ opacity: 0, scale: 0.96, rotate: -0.6 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      role="tooltip"
    >
      <div className="word-preview-head">
        <span className="word-font word-preview-word" lang="en">
          {entry.word}
        </span>
        <KBadge word={entry.word} plain />
      </div>
      {e?.phonetic && <p className="phonetic word-preview-ipa">{e.phonetic}</p>}
      {entry.translation && <p className="word-preview-translation">{entry.translation}</p>}
      {definitions.map((m) => (
        <p key={m.partOfSpeech} className="word-preview-def">
          <span className="pos">{m.partOfSpeech}</span> <span className="clamp">{m.definitions[0]?.definition}</span>
        </p>
      ))}
      {!e && <p className="faint small">Dictionary details will appear once they are fetched.</p>}
      {phrases.length > 0 && (
        <p className="line-phrases word-preview-phrases" lang="en">
          {phrases.map((p) => (
            <span key={p} className="line-phrase word-font">
              {p}
            </span>
          ))}
        </p>
      )}
      {sentence && (
        <blockquote className={`word-preview-sentence word-font${sentence.mine ? '' : ' faint'}`} lang="en">
          “{sentence.text}”
        </blockquote>
      )}
      <div className="word-preview-foot">
        <span>
          {source}
          {encounters > 1 && ` · met ${encounters} times`}
        </span>
        <span className="row" style={{ gap: 6 }}>
          {MASTERY_LABELS[entry.mastery]} <MasteryMeter level={entry.mastery} />
        </span>
      </div>
      <p className="faint small word-preview-date">Added {dateFormat.format(new Date(entry.createdAt))}</p>
    </motion.div>
  )
}

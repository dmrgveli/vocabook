import { motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MASTERY_LABELS, metEncounters, type Entry } from '../data/model'
import { entrySource, lineSentence, topPhrases } from '../data/notebook'
import { KBadge, MasteryMeter, toneClass } from './ui'

// Desktop only: resting the pointer on a word in the one-line-per-word notebook opens a card
// with its details next to the word. It is a preview, not a control: the line itself opens
// the page. A row can mark the element to sit next to with data-preview-anchor.

const HOVER_QUERY = '(hover: hover) and (min-width: 900px)'
const OPEN_DELAY_MS = 320
const WIDTH = 320
const GAP = 12

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export interface PreviewTarget {
  entry: Entry
  rect: DOMRect
}

/** Hover handlers for the rows, and the target currently previewed. */
export function useWordPreview() {
  const [target, setTarget] = useState<PreviewTarget>()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

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
      const el = e.currentTarget.querySelector('[data-preview-anchor]') ?? e.currentTarget
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setTarget({ entry, rect: el.getBoundingClientRect() }), OPEN_DELAY_MS)
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

function PreviewCard({ target: { entry, rect } }: { target: PreviewTarget }) {
  const ref = useRef<HTMLDivElement>(null)
  // to the right of the row when there is room, else to its left
  const left = rect.right + GAP + WIDTH < innerWidth ? rect.right + GAP : Math.max(GAP, rect.left - GAP - WIDTH)
  const [top, setTop] = useState(rect.top)

  // keep the whole card on screen
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0
    setTop(Math.max(GAP, Math.min(rect.top - 8, innerHeight - h - GAP)))
  }, [rect])

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
      style={{ left, top, width: WIDTH }}
      initial={{ opacity: 0, x: left > rect.left ? -6 : 6, rotate: -0.6 }}
      animate={{ opacity: 1, x: 0, rotate: 0 }}
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

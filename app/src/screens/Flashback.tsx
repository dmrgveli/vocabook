import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Check, HelpCircle, Plus, RotateCcw, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAppState } from '../app/state'
import { KBadge, SpeakButton } from '../components/ui'
import { markViewed, updateEntry } from '../data/db'
import {
  buildRound,
  buildRoundOf,
  clampRoundSize,
  DEFAULT_ROUND_SIZE,
  FLASHBACK_MIN_WORDS,
  GAP,
  MIN_ROUND_SIZE,
  RESULT_LABEL,
  ROUND_SIZES,
  shouldAskSize,
  afterRound,
  KNOW_IT_DAYS,
  type FlashCard,
  type RoundResult,
} from '../data/flashback'
import { FlashbackHistoryButton } from '../components/FlashbackHistory'
import { MASTERY_LABELS, now, type Entry } from '../data/model'
import { wordPath } from '../data/paths'
import { dueEntries, nextDue, whenLabel } from '../data/srs'
import { speak } from '../speech'

// Flashback: a short round of recall with your own words (logic in data/flashback.ts).
// Pick an option → the card flips to the answer → next. Missed words come back once at
// the end; a finished round is written to each word's timeline.

/** The most cards a review round takes from the due words; the rest wait for the next round. */
const MAX_REVIEW = 15

type Session = { id: number; size: number; words?: Entry[] }

export function Flashback({ entries }: { entries: Entry[] }) {
  const location = useLocation()
  const navigate = useNavigate()
  // words picked in the notebook (bulk "Practice"), passed once through the history state
  const pickedIds = (location.state as { practice?: string[] } | null)?.practice
  const ask = shouldAskSize(entries.length)
  const due = useMemo(() => dueEntries(entries), [entries])
  const [session, setSession] = useState<Session | undefined>(() => {
    const picked = pickedIds && entries.filter((e) => pickedIds.includes(e.id))
    if (picked?.length) return { id: 1, size: picked.length, words: picked }
    // A small notebook with nothing due starts a short round straight away (as before).
    return !ask && due.length === 0 && entries.length >= FLASHBACK_MIN_WORDS ? { id: 1, size: DEFAULT_ROUND_SIZE } : undefined
  })
  const [picking, setPicking] = useState(false)
  useEffect(() => {
    if (pickedIds) navigate('.', { replace: true, state: null })
  }, [])

  if (entries.length < FLASHBACK_MIN_WORDS) return <NotEnoughWords count={entries.length} />

  const free = (n: number) => {
    setSession((s) => ({ id: (s?.id ?? 0) + 1, size: clampRoundSize(n, entries.length) }))
    setPicking(false)
  }
  const review = () => {
    const words = due.slice(0, MAX_REVIEW)
    setSession((s) => ({ id: (s?.id ?? 0) + 1, size: words.length, words }))
  }

  return (
    <div className="page flashback">
      {session === undefined ? (
        <FlashbackHeader entries={entries} />
      ) : (
        <Round key={session.id} entries={entries} size={session.size} words={session.words} onAgain={() => setSession(undefined)} />
      )}
      {session === undefined && !picking && <StartPanel entries={entries} due={due} onReview={review} onFree={() => (ask ? setPicking(true) : free(DEFAULT_ROUND_SIZE))} />}
      <SizePicker open={picking} wordCount={entries.length} onPick={free} onClose={() => setPicking(false)} />
    </div>
  )
}

/** Before a round: the words due today (spaced repetition, data/srs.ts) and free practice. */
function StartPanel({ entries, due, onReview, onFree }: { entries: Entry[]; due: Entry[]; onReview: () => void; onFree: () => void }) {
  const next = due.length ? undefined : nextDue(entries)
  return (
    <div className="flash-start-grid">
      <section className={`flash-card box flash-start flash-due${due.length ? '' : ' is-clear'}`}>
        {due.length ? (
          <>
            <span className="label-sm">Due today</span>
            <p className="flash-due-count">
              <b>{due.length}</b> {due.length === 1 ? 'word is' : 'words are'} ready for a review
            </p>
            <p className="faint small">
              Each word comes back just before you'd forget it: sooner when it slips, later each time you remember it.
            </p>
            <div className="flash-due-words">
              {due.slice(0, 8).map((e) => (
                <span key={e.id} className="chip word-font">
                  {e.word}
                </span>
              ))}
              {due.length > 8 && <span className="faint small">+{due.length - 8} more</span>}
            </div>
            <div className="row flash-actions">
              <button className="btn btn-marker" onClick={onReview}>
                Review {Math.min(due.length, MAX_REVIEW)} {due.length > MAX_REVIEW ? `of ${due.length}` : ''} <ArrowRight size={16} />
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="label-sm">All caught up</span>
            <p className="flash-due-count">Nothing to review today.</p>
            {next && (
              <p className="faint small">
                Next: {next.count} {next.count === 1 ? 'word' : 'words'} {whenLabel(next.at)}.
              </p>
            )}
          </>
        )}
      </section>
      <section className="flash-card box flash-start">
        <span className="label-sm">Free practice</span>
        <p className="flash-clue">A short round with any of your words, back in the moments you met them.</p>
        <div className="row flash-actions">
          <button className="btn" onClick={onFree}>
            Start a round <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </div>
  )
}

function FlashbackHeader({ entries, children }: { entries?: Entry[]; children?: React.ReactNode }) {
  return (
    <header className="page-header flashback-head">
      <h1 className="page-title">
        <span className="marked">Flashback</span>
      </h1>
      {children}
      {entries && <FlashbackHistoryButton entries={entries} />}
    </header>
  )
}

/* ---------- how many cards ---------- */

function SizePicker({ open, wordCount, onPick, onClose }: { open: boolean; wordCount: number; onPick: (n: number) => void; onClose: () => void }) {
  const [custom, setCustom] = useState('')
  const customN = Number(custom)
  const customOk = Number.isInteger(customN) && customN >= MIN_ROUND_SIZE && customN <= wordCount

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay overlay-soft"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            className="dialog reminder size-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="size-title"
            initial={{ opacity: 0, y: 16, rotate: -1.5 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          >
            <button className="icon-btn reminder-close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
            <h2 id="size-title" className="reminder-title">
              How many <span className="marked">cards</span>?
            </h2>
            <p className="muted reminder-sub">You have {wordCount} words. Words that came up less often get picked first.</p>
            <div className="size-options">
              {ROUND_SIZES.map((n, i) => (
                <button
                  key={n}
                  className="size-option"
                  style={{ '--tilt': `${[-2, 1.5, -1][i]}deg` } as React.CSSProperties}
                  disabled={n > wordCount}
                  autoFocus={i === 0}
                  onClick={() => onPick(n)}
                >
                  <strong>{n}</strong>
                  <span>{['quick', 'steady', 'deep dive'][i]}</span>
                </button>
              ))}
            </div>
            <form
              className="size-custom"
              onSubmit={(e) => {
                e.preventDefault()
                if (customOk) onPick(customN)
              }}
            >
              <label className="label">
                <span>Or any number</span>
                <input
                  className="field"
                  type="number"
                  inputMode="numeric"
                  min={MIN_ROUND_SIZE}
                  max={wordCount}
                  placeholder={`${MIN_ROUND_SIZE}–${wordCount}`}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                />
              </label>
              <button className="btn btn-marker" disabled={!customOk}>
                Start <ArrowRight size={16} />
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------- a round ---------- */

interface Answer {
  /** index of the picked option; -1 = "I don't know"; undefined on reveal-only cards */
  picked?: number
  correct?: boolean
}

function Round({ entries, size, words, onAgain }: { entries: Entry[]; size: number; words?: Entry[]; onAgain: () => void }) {
  // The round is fixed when it starts; later edits (a mastery change) don't reshuffle it.
  const [cards] = useState(() => (words ? buildRoundOf(words, entries) : buildRound(entries, size)))
  const [queue, setQueue] = useState(cards)
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState<Answer>()
  const [results, setResults] = useState(new Map<string, RoundResult>())
  const [streak, setStreak] = useState(0)
  const [marks, setMarks] = useState<boolean[]>([])
  /** words that moved up to Know it with this round */
  const [promoted, setPromoted] = useState<Entry[]>([])
  const byId = new Map(entries.map((e) => [e.id, e]))

  const card = queue[index]
  const done = index >= queue.length

  function choose(picked: number) {
    if (answer) return
    const correct = picked >= 0 && card.choices[picked].correct
    setAnswer({ picked, correct })
    setStreak((s) => (correct ? s + 1 : 0))
    speak(card.entry.word)
    void markViewed(card.entry.id)
  }

  /** Moves on. `gotIt` is the self-rating on reveal-only cards; otherwise the pick decides. */
  function next(gotIt = answer?.correct ?? false) {
    const id = card.entry.id
    const cameBack = results.has(id)
    const nextResults = new Map(results).set(id, gotIt ? (cameBack ? 'came-back' : 'first-try') : 'still-learning')
    // missed the first time: the word comes back once at the end of the round
    const nextQueue = !gotIt && !cameBack ? [...queue, card] : queue
    setResults(nextResults)
    setQueue(nextQueue)
    setMarks((m) => [...m, gotIt])
    setAnswer(undefined)
    setIndex(index + 1)
    // The last card: the round goes on each word's timeline. Done here, in the click,
    // so it happens exactly once.
    if (index + 1 >= nextQueue.length) {
      const resultOf = (id: string) => nextResults.get(id) ?? 'still-learning'
      setPromoted(cards.map((c) => byId.get(c.entry.id) ?? c.entry).filter((e) => afterRound(e, resultOf(e.id)).mastery !== e.mastery))
      for (const c of cards) void updateEntry(c.entry.id, (e) => afterRound(e, resultOf(c.entry.id)))
    }
  }

  // Number keys pick an option.
  useEffect(() => {
    if (done || answer || !card.choices.length) return
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (n >= 1 && n <= card.choices.length && !(e.target as HTMLElement).closest('input, textarea')) choose(n - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <>
      <FlashbackHeader entries={entries}>
        {!done && (
          <div className="row flash-status">
            <AnimatePresence>
              {streak >= 2 && (
                <motion.span
                  key={streak}
                  className="combo"
                  initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
                  animate={{ scale: 1, rotate: -4, opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                >
                  {streak} in a row
                </motion.span>
              )}
            </AnimatePresence>
            <ol className="flash-progress" aria-label={`Card ${index + 1} of ${queue.length}`}>
              {queue.map((_, i) => (
                <li key={i} data-state={i < index ? (marks[i] ? 'right' : 'missed') : i === index ? 'now' : 'next'} />
              ))}
            </ol>
          </div>
        )}
      </FlashbackHeader>

      {done ? (
        <RoundSummary cards={cards} results={results} byId={byId} promoted={promoted} onAgain={onAgain} />
      ) : (
        <div className="flash-stage" data-left={Math.min(queue.length - index - 1, 2)}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.section
              key={`${index}-${answer ? 'back' : 'front'}`}
              className="flash-card box"
              initial={answer ? { rotateY: -90, opacity: 0.4 } : { opacity: 0, y: 24, rotate: index % 2 ? 2 : -2 }}
              animate={{ rotateY: 0, opacity: 1, y: 0, rotate: 0 }}
              exit={answer ? { rotateY: 90, opacity: 0, transition: { duration: 0.16 } } : { x: -60, rotate: -6, opacity: 0, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            >
              {answer || !card.choices.length ? (
                answer ? (
                  <Reveal card={card} entry={byId.get(card.entry.id) ?? card.entry} answer={answer} onNext={() => next()} />
                ) : (
                  <RecallOnly card={card} entry={byId.get(card.entry.id) ?? card.entry} onNext={next} />
                )
              ) : (
                <Ask card={card} onChoose={choose} />
              )}
            </motion.section>
          </AnimatePresence>
        </div>
      )}
    </>
  )
}

const PROMPT_LABEL: Record<FlashCard['kind'], string> = {
  moment: 'Which word fills the gap?',
  phrase: 'Which word completes the phrase?',
  meaning: 'Which word is it?',
  word: 'What does it mean?',
}

function Ask({ card, onChoose }: { card: FlashCard; onChoose: (i: number) => void }) {
  return (
    <>
      <p className="label-sm flash-label">{PROMPT_LABEL[card.kind]}</p>
      {card.kind === 'moment' && (
        <>
          <blockquote className="flash-prompt word-font" lang="en">
            <GapSentence text={card.prompt} />
          </blockquote>
          {card.realExample ? (
            <p className="faint small flash-source">From real-world English</p>
          ) : (
            card.source && <p className="faint small flash-source">You met it in {card.source}</p>
          )}
        </>
      )}
      {card.kind === 'phrase' && (
        <>
          <blockquote className="flash-prompt word-font" lang="en">
            <GapSentence text={card.prompt} />
          </blockquote>
          <p className="faint small flash-source">A phrase people often use</p>
        </>
      )}
      {card.kind === 'meaning' && <p className="flash-clue">{card.prompt}</p>}
      {card.kind === 'word' && (
        <div className="row flash-word-row">
          <span className="word-font flash-word" lang="en">
            {card.prompt}
          </span>
          <SpeakButton text={card.prompt} size="lg" />
        </div>
      )}

      <ul className="flash-options" data-kind={card.kind === 'word' ? 'meanings' : 'words'}>
        {card.choices.map((c, i) => (
          <li key={c.label} style={{ '--tilt': `${[-1.2, 0.8, 1.4, -0.6][i]}deg`, '--i': i } as React.CSSProperties}>
            <button className={card.kind === 'word' ? 'flash-option' : 'flash-option word-font'} lang="en" onClick={() => onChoose(i)}>
              <kbd>{i + 1}</kbd>
              <span>{c.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="row flash-actions">
        <button className="btn btn-quiet" onClick={() => onChoose(-1)}>
          <HelpCircle size={15} /> I don't know
        </button>
      </div>
    </>
  )
}

/** Cards without options (a word with no meaning or sentence yet): recall, reveal, rate yourself. */
function RecallOnly({ card, entry, onNext }: { card: FlashCard; entry: Entry; onNext: (gotIt: boolean) => void }) {
  const [shown, setShown] = useState(false)
  if (shown)
    return (
      <>
        <AnswerDetails entry={entry} card={card} />
        <div className="row flash-actions">
          <button className="btn" onClick={() => onNext(false)}>
            <RotateCcw size={15} /> Not yet
          </button>
          <button className="btn btn-marker" autoFocus onClick={() => onNext(true)}>
            <Check size={16} strokeWidth={2.5} /> I knew it
          </button>
        </div>
      </>
    )
  return (
    <>
      <p className="label-sm flash-label">What does it mean?</p>
      <div className="row flash-word-row">
        <span className="word-font flash-word" lang="en">
          {card.prompt}
        </span>
        <SpeakButton text={card.prompt} size="lg" />
      </div>
      <div className="row flash-actions">
        <span className="faint small">Say it in your own words, then check.</span>
        <button
          className="btn btn-marker"
          autoFocus
          onClick={() => {
            setShown(true)
            speak(entry.word)
            void markViewed(entry.id)
          }}
        >
          Reveal <ArrowRight size={16} />
        </button>
      </div>
    </>
  )
}

function Reveal({ card, entry, answer, onNext }: { card: FlashCard; entry: Entry; answer: Answer; onNext: () => void }) {
  const picked = answer.picked !== undefined && answer.picked >= 0 ? card.choices[answer.picked] : undefined
  return (
    <>
      <div className="flash-verdict" data-correct={answer.correct}>
        {answer.correct ? (
          <>
            <Burst />
            <Check size={18} strokeWidth={3} /> Spot on!
          </>
        ) : picked ? (
          <>
            Not quite: <s>{picked.label}</s>
          </>
        ) : (
          <>Here it is:</>
        )}
      </div>
      <AnswerDetails entry={entry} card={card} />
      <div className="row flash-actions">
        <button className="btn btn-marker" autoFocus onClick={onNext}>
          Next <ArrowRight size={16} />
        </button>
      </div>
    </>
  )
}

function AnswerDetails({ entry, card }: { entry: Entry; card: FlashCard }) {
  const definition = entry.enrichment?.meanings[0]?.definitions[0]?.definition
  const moment =
    (card.kind === 'moment' || card.kind === 'phrase') && card.sentence
      ? { sentence: card.sentence, source: card.kind === 'phrase' ? 'a common phrase' : card.realExample ? 'real-world English' : card.source }
      : undefined
  return (
    <>
      <div className="row flash-word-row">
        <Link to={wordPath(entry.word)} className="word-font flash-word marked" lang="en">
          {entry.word}
        </Link>
        <KBadge word={entry.word} />
        <SpeakButton text={entry.word} size="lg" />
      </div>
      {entry.translation && <p className="flash-translation">{entry.translation}</p>}
      {definition && <p className="muted clamp">{definition}</p>}
      {moment?.sentence && (
        <blockquote className="flash-moment word-font" lang="en">
          “{moment.sentence}” <span className="faint small">· {moment.source}</span>
        </blockquote>
      )}
      {entry.mastery === 'recognize' && (
        <button className="chip flash-bump" onClick={() => updateEntry(entry.id, (e) => ({ ...e, mastery: 'understand', masteryAt: now() }))}>
          I know what it means now → {MASTERY_LABELS.understand}
        </button>
      )}
    </>
  )
}

/** A little burst of highlighter dots for a right answer (CSS only; still under reduced motion). */
function Burst() {
  return (
    <span className="burst" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <i key={i} style={{ '--a': `${i * 36}deg`, '--d': `${34 + (i % 3) * 10}px` } as React.CSSProperties} />
      ))}
    </span>
  )
}

function GapSentence({ text }: { text: string }) {
  const parts = text.split(GAP)
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <span className="flash-gap" aria-label="missing word" />}
        </span>
      ))}
    </>
  )
}

/* ---------- end of the round ---------- */

function RoundSummary({
  cards,
  results,
  byId,
  promoted,
  onAgain,
}: {
  cards: FlashCard[]
  results: Map<string, RoundResult>
  byId: Map<string, Entry>
  promoted: Entry[]
  onAgain: () => void
}) {
  const remembered = cards.filter((c) => results.get(c.entry.id) !== 'still-learning')
  const share = cards.length ? remembered.length / cards.length : 0
  // Producing a sentence makes a word stick far better than reading it again.
  const practice = remembered.map((c) => byId.get(c.entry.id)).find((e) => e && !e.ownSentence)
  const [pct, setPct] = useState(0)

  // the ring fills after the card has appeared
  useEffect(() => {
    const t = setTimeout(() => setPct(Math.round(share * 100)), 120)
    return () => clearTimeout(t)
  }, [share])

  return (
    <motion.section className="flash-card box flash-summary" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flash-summary-head">
        <div className="score-ring" style={{ '--pct': `${pct}%` } as React.CSSProperties} aria-hidden>
          <span>
            {remembered.length}/{cards.length}
          </span>
        </div>
        <div>
          <span className="flash-stamp">Round done</span>
          <h2 className="flash-summary-title">
            {share === 1 ? 'Every single one.' : share >= 0.6 ? 'Nicely remembered.' : 'Good practice.'} You remembered {remembered.length} of{' '}
            {cards.length}.
          </h2>
          <p className="faint small">Saved on each word’s timeline.</p>
        </div>
      </div>
      <ul className="flash-results">
        {cards.map((c, i) => {
          const r = results.get(c.entry.id) ?? 'still-learning'
          return (
            <motion.li
              key={c.entry.id}
              data-result={r}
              initial={{ opacity: 0, scale: 0.6, rotate: i % 2 ? 6 : -6 }}
              animate={{ opacity: 1, scale: 1, rotate: i % 2 ? 1 : -1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.25 + i * 0.06 }}
            >
              <Link to={wordPath(c.entry.word)} className="word-font" lang="en">
                {c.entry.word}
              </Link>
              <span className="faint small">{RESULT_LABEL[r]}</span>
            </motion.li>
          )
        })}
      </ul>
      {promoted.length > 0 && <Promoted words={promoted} />}
      {practice && <SentencePractice entry={practice} />}
      <div className="row flash-actions">
        <Link to="/" className="btn btn-quiet">
          Back to notebook
        </Link>
        <button className="btn btn-marker" onClick={onAgain}>
          <RotateCcw size={15} /> Another round
        </button>
      </div>
    </motion.section>
  )
}

/** Words that moved up to Know it on their own, with a way to put them back. */
function Promoted({ words }: { words: Entry[] }) {
  const [undone, setUndone] = useState(false)
  const undo = () => {
    const t = now()
    for (const w of words) void updateEntry(w.id, (e) => ({ ...e, mastery: 'recognize', masteryAt: t }))
    setUndone(true)
  }
  return (
    <motion.p className="notice flash-promoted" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
      {undone ? (
        <span>Kept at {MASTERY_LABELS.recognize}.</span>
      ) : (
        <>
          <Sparkles size={15} className="flash-promoted-icon" />
          <span>
            {words.map((w, i) => (
              <span key={w.id}>
                {i > 0 && ', '}
                <Link to={wordPath(w.word)} className="word-font" lang="en">
                  {w.word}
                </Link>
              </span>
            ))}{' '}
            {words.length === 1 ? 'is' : 'are'} now <b>{MASTERY_LABELS.understand}</b>: remembered on {KNOW_IT_DAYS} different days.
          </span>
          <button className="btn btn-quiet small" onClick={undo}>
            Undo
          </button>
        </>
      )}
    </motion.p>
  )
}

function SentencePractice({ entry }: { entry: Entry }) {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  if (saved)
    return (
      <p className="notice">
        Saved as your sentence on <Link to={wordPath(entry.word)}>{entry.word}</Link>’s page.
      </p>
    )
  return (
    <form
      className="flash-practice"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!text.trim()) return
        await updateEntry(entry.id, (x) => ({ ...x, ownSentence: text.trim() }))
        setSaved(true)
      }}
    >
      <label className="label">
        <span>
          One more step: use <strong className="word-font">{entry.word}</strong> in a sentence from your own life.
        </span>
        <textarea className="field" lang="en" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <button className="btn" disabled={!text.trim()}>
        Save my sentence
      </button>
    </form>
  )
}

function NotEnoughWords({ count }: { count: number }) {
  const { openQuickAdd } = useAppState()
  return (
    <div className="page flashback">
      <FlashbackHeader />
      <section className="flash-card box">
        <p className="label-sm flash-label">Almost there</p>
        <h2 className="flash-summary-title">Add {FLASHBACK_MIN_WORDS} or more words to start Flashback.</h2>
        <p className="muted">
          Flashback is a short round of remembering your own words, back in the moments you met them. You have {count}{' '}
          {count === 1 ? 'word' : 'words'} so far.
        </p>
        <ol className="flash-progress flash-progress-big" aria-label={`${count} of ${FLASHBACK_MIN_WORDS} words`}>
          {Array.from({ length: FLASHBACK_MIN_WORDS }, (_, i) => (
            <li key={i} data-state={i < count ? 'right' : 'next'} />
          ))}
        </ol>
        <div className="row flash-actions">
          <button className="btn btn-marker" onClick={() => openQuickAdd()}>
            <Plus size={16} strokeWidth={2.5} /> Add a word
          </button>
        </div>
      </section>
    </div>
  )
}

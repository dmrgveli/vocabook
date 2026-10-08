import { motion } from 'motion/react'
import { ArrowRight, Check, Lightbulb, Plus, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppState } from '../app/state'
import { KBadge, SpeakButton } from '../components/ui'
import { markViewed, updateEntry } from '../data/db'
import { buildRound, checkAnswer, FLASHBACK_MIN_WORDS, GAP, hintFor, type AnswerCheck, type FlashCard } from '../data/flashback'
import { alive, MASTERY_LABELS, type Entry } from '../data/model'
import { wordPath } from '../data/paths'
import { speak } from '../speech'

// Flashback: a short round of recall with your own words (logic in data/flashback.ts).
// Ask → reveal → "Got it" / "Not yet". Words you didn't have come back once at the end;
// the round closes with an invitation to use one word in a sentence of your own.

type Result = 'first-try' | 'came-back' | 'still-learning'

export function Flashback({ entries }: { entries: Entry[] }) {
  const [roundId, setRoundId] = useState(0)
  // A round is fixed when it starts; later edits (a mastery change) don't reshuffle it.
  const cards = useMemo(() => buildRound(entries), [roundId, entries.length >= FLASHBACK_MIN_WORDS])
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])

  if (entries.length < FLASHBACK_MIN_WORDS) return <NotEnoughWords count={entries.length} />
  return <Round key={roundId} cards={cards} byId={byId} onAgain={() => setRoundId((n) => n + 1)} />
}

function Round({ cards, byId, onAgain }: { cards: FlashCard[]; byId: Map<string, Entry>; onAgain: () => void }) {
  const [queue, setQueue] = useState(cards)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState<{ check?: AnswerCheck }>()
  const [results, setResults] = useState(new Map<string, Result>())

  const card = queue[index]
  const done = index >= queue.length

  function reveal(check?: AnswerCheck) {
    setRevealed({ check })
    speak(card.entry.word)
    void markViewed(card.entry.id)
  }

  function next(gotIt: boolean) {
    const id = card.entry.id
    const cameBack = results.has(id)
    const result: Result = gotIt ? (cameBack ? 'came-back' : 'first-try') : 'still-learning'
    setResults((r) => new Map(r).set(id, result))
    // "Not yet" the first time: the word comes back once at the end of the round.
    if (!gotIt && !cameBack) setQueue((q) => [...q, card])
    setRevealed(undefined)
    setIndex((i) => i + 1)
  }

  return (
    <div className="page flashback">
      <header className="page-header flashback-head">
        <h1 className="page-title">
          <span className="marked">Flashback</span>
        </h1>
        {!done && (
          <ol className="flash-progress" aria-label={`Card ${index + 1} of ${queue.length}`}>
            {queue.map((_, i) => (
              <li key={i} data-state={i < index ? 'done' : i === index ? 'now' : 'next'} />
            ))}
          </ol>
        )}
      </header>

      {done ? (
        <RoundSummary cards={cards} results={results} byId={byId} onAgain={onAgain} />
      ) : (
        <motion.section
          key={index}
          className="flash-card box"
          initial={{ opacity: 0, y: 14, rotate: index % 2 ? 1 : -1 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        >
          {revealed ? (
            <Reveal card={card} entry={byId.get(card.entry.id) ?? card.entry} check={revealed.check} onNext={next} />
          ) : (
            <Ask card={card} onReveal={reveal} />
          )}
        </motion.section>
      )}
    </div>
  )
}

const PROMPT_LABEL: Record<FlashCard['kind'], string> = {
  moment: 'Which word fills the gap?',
  meaning: 'Which word is it?',
  word: 'What does it mean?',
}

function Ask({ card, onReveal }: { card: FlashCard; onReveal: (check?: AnswerCheck) => void }) {
  const [answer, setAnswer] = useState('')
  const [hint, setHint] = useState(false)
  const typed = card.kind !== 'word'

  return (
    <>
      <p className="label-sm flash-label">{PROMPT_LABEL[card.kind]}</p>

      {card.kind === 'moment' && (
        <>
          <blockquote className="flash-prompt word-font" lang="en">
            <GapSentence text={card.prompt} />
          </blockquote>
          {card.source && <p className="faint small">You met it in {card.source}</p>}
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

      {typed ? (
        <form
          className="flash-answer"
          onSubmit={(e) => {
            e.preventDefault()
            if (answer.trim()) onReveal(checkAnswer(answer, card.entry.word))
          }}
        >
          <input
            className="field flash-input"
            lang="en"
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={hint ? hintFor(card.entry.word) : 'Type the word…'}
            aria-label="Your answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <div className="row flash-actions">
            <button type="button" className="btn btn-quiet" onClick={() => setHint(true)} disabled={hint}>
              <Lightbulb size={15} /> {hint ? hintFor(card.entry.word) : 'Hint'}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => onReveal()}>
              Show me
            </button>
            <button className="btn btn-marker" disabled={!answer.trim()}>
              Check <ArrowRight size={16} />
            </button>
          </div>
        </form>
      ) : (
        <div className="row flash-actions">
          <span className="faint small">Say it in your own words, in your head or out loud.</span>
          <button className="btn btn-marker" autoFocus onClick={() => onReveal()}>
            Reveal <ArrowRight size={16} />
          </button>
        </div>
      )}
    </>
  )
}

const FEEDBACK: Record<AnswerCheck, string> = {
  right: 'Spot on.',
  close: 'Almost: check the spelling.',
  wrong: 'Not this time. Here it is:',
}

function Reveal({ card, entry, check, onNext }: { card: FlashCard; entry: Entry; check?: AnswerCheck; onNext: (gotIt: boolean) => void }) {
  const definition = entry.enrichment?.meanings[0]?.definitions[0]?.definition
  const moment = alive(entry.encounters).find((enc) => enc.sentence && card.kind === 'moment' && enc.source === card.source)

  return (
    <>
      {check && (
        <p className="flash-feedback" data-check={check}>
          {check === 'right' && <Check size={16} strokeWidth={3} />} {FEEDBACK[check]}
        </p>
      )}
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
        <button className="chip flash-bump" onClick={() => updateEntry(entry.id, (e) => ({ ...e, mastery: 'understand' }))}>
          I know what it means now → {MASTERY_LABELS.understand}
        </button>
      )}
      <div className="row flash-actions">
        <button className="btn" onClick={() => onNext(false)}>
          <RotateCcw size={15} /> Not yet
        </button>
        <button className="btn btn-marker" autoFocus onClick={() => onNext(true)}>
          <Check size={16} strokeWidth={2.5} /> Got it
        </button>
      </div>
    </>
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

const RESULT_LABEL: Record<Result, string> = {
  'first-try': 'remembered',
  'came-back': 'remembered the second time',
  'still-learning': 'still settling in',
}

function RoundSummary({ cards, results, byId, onAgain }: { cards: FlashCard[]; results: Map<string, Result>; byId: Map<string, Entry>; onAgain: () => void }) {
  const remembered = cards.filter((c) => results.get(c.entry.id) !== 'still-learning')
  // Producing a sentence makes a word stick far better than reading it again.
  const practice = remembered.map((c) => byId.get(c.entry.id)).find((e) => e && !e.ownSentence)

  return (
    <motion.section className="flash-card box" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
      <p className="label-sm flash-label">
        <Sparkles size={14} /> Round done
      </p>
      <h2 className="flash-summary-title">
        You remembered {remembered.length} of {cards.length} {cards.length === 1 ? 'word' : 'words'}.
      </h2>
      <ul className="flash-results">
        {cards.map((c) => {
          const r = results.get(c.entry.id) ?? 'still-learning'
          return (
            <li key={c.entry.id} data-result={r}>
              <Link to={wordPath(c.entry.word)} className="word-font" lang="en">
                {c.entry.word}
              </Link>
              <span className="faint small">{RESULT_LABEL[r]}</span>
            </li>
          )
        })}
      </ul>
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
  useEffect(() => window.scrollTo(0, 0), [])
  return (
    <div className="page flashback">
      <header className="page-header">
        <h1 className="page-title">
          <span className="marked">Flashback</span>
        </h1>
      </header>
      <section className="flash-card box">
        <p className="flash-clue">
          A short round of remembering your own words, back in the moments you met them. It starts once your notebook has{' '}
          {FLASHBACK_MIN_WORDS} words{count > 0 && <> (you have {count})</>}.
        </p>
        <div className="row flash-actions">
          <button className="btn btn-marker" onClick={() => openQuickAdd()}>
            <Plus size={16} strokeWidth={2.5} /> Add a word
          </button>
        </div>
      </section>
    </div>
  )
}

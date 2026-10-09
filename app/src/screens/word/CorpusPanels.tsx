import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeftRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { corpusAvailable, fetchComparison, fetchCorpusData, useWordSource, type Comparison } from '../../api/corpus'
import { SpeakButton } from '../../components/ui'
import { PeekWord } from '../../components/WordPeek'
import type { CollocationGroup, CorpusData, CorpusExample } from '../../data/model'
import { speak } from '../../speech'
import { useAuth } from '../../sync/auth'

// The word page's corpus layer (api/corpus.ts): collocations grouped by grammar, real
// example sentences and a comparison with a similar word. When it is switched off, not
// signed in or unavailable, the page shows the classic word data instead.

export type CorpusState = { status: 'off' | 'loading' | 'failed' } | { status: 'ready'; data: CorpusData }

/**
 * The corpus data for a word: what the entry already has, else fetched once (shared per
 * session, cached for everyone by the Worker). `onLoaded` lets a word page keep it.
 */
export function useCorpus(word: string, existing: CorpusData | undefined, onLoaded?: (data: CorpusData) => void): CorpusState {
  const mode = useWordSource()
  const auth = useAuth()
  const [state, setState] = useState<CorpusState>(existing ? { status: 'ready', data: existing } : { status: 'off' })

  useEffect(() => {
    if (mode !== 'rich') return setState({ status: 'off' })
    if (existing) return setState({ status: 'ready', data: existing })
    if (!corpusAvailable()) return setState({ status: 'off' })
    let active = true
    setState({ status: 'loading' })
    fetchCorpusData(word).then(
      (data) => {
        if (!active) return
        setState({ status: 'ready', data })
        onLoaded?.(data)
      },
      () => active && setState({ status: 'failed' }),
    )
    return () => {
      active = false
    }
  }, [word, mode, auth.status, Boolean(existing)])

  return mode === 'rich' ? state : { status: 'off' }
}

/** The collocate inside a phrase, so it can stand out: "make an informed **decision**" → the other word. */
function Phrase({ phrase, word }: { phrase: string; word: string }) {
  const stem = word.slice(0, Math.max(3, word.length - 2)).toLowerCase()
  return (
    <>
      {phrase.split(' ').map((token, i) => (
        <span key={i}>
          {i > 0 && ' '}
          {token.toLowerCase().startsWith(stem) ? <strong>{token}</strong> : token}
        </span>
      ))}
    </>
  )
}

const SHOWN_GROUPS = 4

/** Collocations by grammar: each group a label and a few phrases; tap a phrase to hear it. */
export function CorpusCollocations({ groups }: { groups: CollocationGroup[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? groups : groups.slice(0, SHOWN_GROUPS)
  return (
    <div className="colloc-groups">
      {shown.map((g) => (
        <div key={g.id} className="colloc-group">
          <span className="label-sm colloc-group-label">{g.label}</span>
          <ul className="colloc-phrases">
            {g.items.map((it) => (
              <li key={it.phrase}>
                <button type="button" className="colloc-phrase word-font" lang="en" onClick={() => speak(it.phrase)} title="Hear it">
                  <Phrase phrase={it.phrase} word={it.word} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {groups.length > SHOWN_GROUPS && (
        <button className="btn btn-quiet small kwic-more" onClick={() => setAll((x) => !x)}>
          {all ? 'Show fewer' : `+${groups.length - SHOWN_GROUPS} more kinds`}
        </button>
      )}
    </div>
  )
}

/** Real sentences, chosen as good dictionary examples: short, clear, everyday words. */
export function RealExamples({ examples }: { examples: CorpusExample[] }) {
  return (
    <ul className="real-examples">
      {examples.map((e, i) => {
        const sentence = joinExample(e)
        return (
          <li key={i} lang="en">
            <span className="word-font">
              {e.before} <mark>{e.word}</mark>
              {/^[.,;:!?'’)]/.test(e.after) ? '' : ' '}
              {e.after}
            </span>{' '}
            <SpeakButton text={sentence} label="Read the sentence aloud" />
          </li>
        )
      })}
    </ul>
  )
}

export const joinExample = (e: CorpusExample) => `${e.before} ${e.word}${/^[.,;:!?'’)]/.test(e.after) ? '' : ' '}${e.after}`.trim()

/** "thrive or flourish?": pick a similar word, see which words go with each. */
export function CompareWords({ word, pos, candidates }: { word: string; pos: string; candidates: string[] }) {
  const [other, setOther] = useState<string>()
  const [state, setState] = useState<{ status: 'loading' | 'failed' } | { status: 'ready'; data: Comparison }>()

  useEffect(() => {
    if (!other) return
    let active = true
    setState({ status: 'loading' })
    fetchComparison(word, other, pos).then(
      (data) => active && setState({ status: 'ready', data }),
      () => active && setState({ status: 'failed' }),
    )
    return () => {
      active = false
    }
  }, [word, other, pos])

  if (candidates.length === 0) return null
  return (
    <div className="compare">
      <div className="word-chips">
        <span className="faint coll-label">
          <ArrowLeftRight size={13} /> Compare with
        </span>
        <div className="row" style={{ gap: 6 }}>
          {candidates.map((c) => (
            <button key={c} className="chip word-font" aria-pressed={other === c} onClick={() => setOther(other === c ? undefined : c)}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {other && state && (
          <motion.div
            key={other}
            className="compare-result"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {state.status === 'loading' && <p className="faint small">Comparing “{word}” and “{other}”…</p>}
            {state.status === 'failed' && <p className="faint small">The comparison isn't available right now.</p>}
            {state.status === 'ready' && <ComparisonTable data={state.data} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ComparisonTable({ data }: { data: Comparison }) {
  const column = (title: string, words: string[], tone: string) =>
    words.length > 0 && (
      <div className={`compare-col ${tone}`}>
        <span className="label-sm">{title}</span>
        <div className="row" style={{ gap: 5 }}>
          {words.map((w) => (
            <PeekWord key={w} word={w} chip />
          ))}
        </div>
      </div>
    )
  if (!data.onlyA.length && !data.onlyB.length && !data.both.length) return <p className="faint small">These two are used in much the same way.</p>
  return (
    <div className="compare-cols">
      {column(`Mostly with “${data.a}”`, data.onlyA, 'tone-k3')}
      {column(`Mostly with “${data.b}”`, data.onlyB, 'tone-k10')}
      {column('With both', data.both, 'tone-unknown')}
    </div>
  )
}

/** Placeholder while the corpus data loads, sized like the panel it becomes. */
export function CorpusSkeleton() {
  return (
    <div className="stack" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="stack" style={{ gap: 6 }}>
          <span className="skeleton" style={{ width: 90, height: 12 }} />
          <span className="skeleton" style={{ width: `${70 - i * 12}%`, height: 22 }} />
        </div>
      ))}
    </div>
  )
}

import { CloudOff, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { enrichEntry, isEnriching } from '../../api/enrich'
import { SpeakButton } from '../../components/ui'
import { LinkedText, PeekWord } from '../../components/WordPeek'
import { patchEnrichment } from '../../data/db'
import { isEnrichmentCurrent, type Collocation, type CorpusData, type Enrichment, type Entry } from '../../data/model'
import { speak } from '../../speech'
import { CompareWords, CorpusCollocations, CorpusHint, CorpusSkeleton, RealExamples, useCorpus } from './CorpusPanels'
import { Panel } from './Panel'

// The automatic layer of a word page: everything that comes from the dictionaries.

/** Which panels to show; the word page spreads them over its two columns. */
export type DictionaryPart = 'main' | 'related' | 'origin'

export function Dictionary({ entry, part = 'main' }: { entry: Entry; part?: DictionaryPart }) {
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
    // only one of the page's Dictionary blocks fetches
    if (part === 'main' && !isEnrichmentCurrent(entry.enrichment)) fetchNow()
  }, [entry.id])

  const refresh = (
    <button className="icon-btn" onClick={fetchNow} disabled={status === 'loading'} title="Fetch again" aria-label="Fetch dictionary data again">
      <RefreshCw size={14} className={status === 'loading' ? 'spin' : ''} />
    </button>
  )

  if (!e) {
    if (part !== 'main') return null
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
    <DictionaryPanels
      enrichment={e}
      word={entry.word}
      aside={refresh}
      part={part}
      onCorpus={(corpus) => void patchEnrichment(entry.id, { corpus })}
    />
  )
}

/**
 * Definitions, words used together, real sentences, related words and origin: shared by
 * word pages and look-ups. `part` picks a slice: 'main' (the first three), 'related',
 * 'origin', or 'side' (related + origin).
 */
export function DictionaryPanels({
  enrichment: e,
  word,
  aside,
  part,
  onCorpus,
}: {
  enrichment: Enrichment
  word: string
  aside?: React.ReactNode
  /** undefined: everything; 'main': definitions, words used together, real sentences */
  part?: DictionaryPart | 'side'
  /** keeps corpus data once it is fetched (word pages store it in the entry) */
  onCorpus?: (corpus: CorpusData) => void
}) {
  const show = (p: DictionaryPart) => !part || part === p || (part === 'side' && p !== 'main')
  const corpus = useCorpus(word, e.corpus, onCorpus)
  const rich = corpus.status === 'ready' ? corpus.data : undefined
  // Dictionary synonyms stay "Similar"; the corpus thesaurus is words *used* like this one
  // (decision → action, policy, plan), which is related but not the same meaning.
  const usedLike = (rich?.similar ?? []).filter((w) => !e.synonyms.includes(w)).slice(0, 8)
  // Worth comparing: near-synonyms first, they are the ones learners mix up.
  const compareWith = [...e.synonyms.filter((w) => !w.includes(' ')), ...(rich?.similar ?? [])].slice(0, 3)
  return (
    <>
      {show('main') && (
        <Panel title="Definitions" aside={aside}>
          <Definitions enrichment={e} word={word} />
        </Panel>
      )}

      {show('main') &&
        (rich?.groups.length ? (
          <Panel title="Used together with" delay={0.05}>
            <CorpusCollocations groups={rich.groups} />
          </Panel>
        ) : corpus.status === 'loading' ? (
          <Panel title="Used together with" delay={0.05}>
            <CorpusSkeleton />
          </Panel>
        ) : (
          hasCollocations(e.collocations) && (
            <Panel title="Used together with" delay={0.05}>
              <Collocations word={word} collocations={e.collocations} />
              <CorpusHint state={corpus} />
            </Panel>
          )
        ))}

      {show('main') && rich && rich.examples.length > 0 && (
        <Panel title="In real sentences" delay={0.08}>
          <RealExamples examples={rich.examples} />
        </Panel>
      )}

      {show('related') && (e.synonyms.length > 0 || e.antonyms.length > 0 || usedLike.length > 0) && (
        <Panel title="Related words" delay={0.1}>
          {e.synonyms.length > 0 && <WordChips label="Similar" words={e.synonyms} />}
          {usedLike.length > 0 && <WordChips label="Used like" words={usedLike} />}
          {e.antonyms.length > 0 && <WordChips label="Opposite" words={e.antonyms} />}
          {rich && !word.includes(' ') && <CompareWords word={word} pos={rich.pos} candidates={compareWith} />}
        </Panel>
      )}

      {show('origin') && e.origin && (
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

export function DefinitionSkeleton() {
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

export function hasCollocations(c: CollocationSet): boolean {
  return c.before.length + c.after.length > 0
}

const COLLOCATIONS_SHOWN = 5

/**
 * A small map of the word in use: the word in the middle, the words that most often
 * come right before it on the left and right after it on the right. More frequent
 * pairs are larger and darker (Datamuse scores, relative to the top pair on that side).
 * Clicking a word reads the phrase aloud.
 */
function Collocations({ word, collocations: c }: { word: string; collocations: CollocationSet }) {
  const [expanded, setExpanded] = useState(false)
  const before = c.before.map(asCollocation)
  const after = c.after.map(asCollocation)
  const limit = expanded ? Infinity : COLLOCATIONS_SHOWN
  const hidden = Math.max(before.length, after.length) - COLLOCATIONS_SHOWN

  const side = (items: Collocation[], where: 'before' | 'after') => {
    const top = Math.max(...items.map((i) => i.score ?? 0), 1)
    return (
      <ol className={`kwic-side kwic-${where}`} aria-label={where === 'before' ? `Words before “${word}”` : `Words after “${word}”`}>
        {items.slice(0, limit).map((item) => {
          const phrase = where === 'before' ? `${item.word} ${word}` : `${word} ${item.word}`
          const share = item.score ? item.score / top : 0.5
          return (
            <li key={item.word}>
              <button
                type="button"
                className="kwic-word"
                lang="en"
                style={{ '--share': share } as React.CSSProperties}
                onClick={() => speak(phrase)}
                title={`“${phrase}”${item.score ? ` · ${share === 1 ? 'most frequent' : `${Math.max(1, Math.round(share * 100))}% as frequent as the top pair`}` : ''}`}
              >
                {item.word}
              </button>
            </li>
          )
        })}
      </ol>
    )
  }

  return (
    <div className="kwic">
      <div className="kwic-map">
        {before.length > 0 ? side(before, 'before') : <span />}
        <span className="kwic-center word-font" lang="en">
          {word}
        </span>
        {after.length > 0 ? side(after, 'after') : <span />}
      </div>
      {hidden > 0 && (
        <button className="btn btn-quiet small kwic-more" onClick={() => setExpanded((x) => !x)}>
          {expanded ? 'Show fewer' : `+${hidden} more`}
        </button>
      )}
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

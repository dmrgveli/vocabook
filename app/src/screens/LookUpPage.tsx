import { CloudOff, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { lookUp } from '../api/enrich'
import { useAppState } from '../app/state'
import type { Enrichment } from '../data/model'
import { parseWordParam, wordPath } from '../data/paths'
import { useEntryAt } from '../hooks'
import { DefinitionSkeleton, DictionaryPanels, hasCollocations } from './word/DictionaryPanels'
import { BackLink, Panel } from './word/Panel'
import { VideosDrawer, WordHeading } from './word/WordHeading'

type LookUpState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; enrichment: Enrichment; frequency?: number }

/**
 * #/look/<word>: the dictionary side of a word page, for a word you have not added.
 * If the word is (or becomes) part of the notebook, this turns into its word page.
 */
export function LookUpPage() {
  const { param } = useParams()
  const target = param ? parseWordParam(param) : undefined
  const word = target && 'word' in target ? target.word : ''
  const entry = useEntryAt(param)
  const navigate = useNavigate()
  const { openQuickAdd } = useAppState()
  const [videosOpen, setVideosOpen] = useState(false)
  const [state, setState] = useState<LookUpState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (entry) navigate(wordPath(entry.word), { replace: true })
  }, [entry])

  useEffect(() => {
    document.querySelector('.main')?.scrollTo(0, 0)
    window.scrollTo(0, 0)
    setVideosOpen(false)
  }, [word])

  useEffect(() => {
    if (!word) return
    let active = true
    setState({ status: 'loading' })
    const { first, late } = lookUp(word)
    first.then(
      (r) => active && setState({ status: 'ready', ...r }),
      () => active && setState({ status: 'error' }),
    )
    // a recording or origin that arrives later is added; the definitions stay as they are
    void late.then(
      (patch) =>
        active && patch && setState((s) => (s.status === 'ready' ? { ...s, enrichment: { ...s.enrichment, ...patch } } : s)),
    )
    return () => {
      active = false
    }
  }, [word, attempt])

  if (!word || entry === undefined || entry) return <div className="page" />
  const e = state.status === 'ready' ? state.enrichment : undefined
  const add = () => openQuickAdd({ word, frequency: state.status === 'ready' ? state.frequency : undefined })

  return (
    <div className="page word-page">
      <BackLink />

      <header className="word-hero">
        <div className="word-hero-main">
          <WordHeading word={word} enrichment={e} videosOpen={videosOpen} onToggleVideos={() => setVideosOpen((o) => !o)} />
        </div>
        <div className="word-hero-side">
          <span className="label-sm">Not in your notebook</span>
          <button className="btn btn-marker" onClick={add}>
            <Plus size={16} strokeWidth={2.5} /> Add to notebook
          </button>
        </div>
      </header>

      <VideosDrawer word={word} open={videosOpen} />

      <div className="word-columns">
        <div className="word-col">
          {state.status === 'ready' ? (
            state.enrichment.definitionsFrom === 'none' && !hasCollocations(state.enrichment.collocations) ? (
              <Panel title="Definitions">
                <p className="muted">
                  Nothing found for “{word}”. Check the spelling, or{' '}
                  <button className="link-btn" onClick={() => navigate(-1)}>
                    go back
                  </button>
                  .
                </p>
              </Panel>
            ) : (
              <DictionaryPanels enrichment={state.enrichment} word={word} part="main" />
            )
          ) : (
            <Panel title="Definitions">
              {state.status === 'error' ? (
                <div className="offline">
                  <CloudOff size={18} />
                  <div>
                    <p>The dictionary services can't be reached right now.</p>
                    <button className="btn" onClick={() => setAttempt((n) => n + 1)}>
                      <RefreshCw size={14} /> Try again
                    </button>
                  </div>
                </div>
              ) : (
                <DefinitionSkeleton />
              )}
            </Panel>
          )}
        </div>
        <div className="word-col">
          {state.status === 'ready' && <DictionaryPanels enrichment={state.enrichment} word={word} part="side" />}
        </div>
      </div>
    </div>
  )
}

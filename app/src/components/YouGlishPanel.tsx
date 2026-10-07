import { ChevronLeft, ChevronRight, RotateCcw, Clapperboard } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import {
  GOOGLE_PRIVACY_URL,
  loadYouGlish,
  setYouGlishConsent,
  useYouGlishConsent,
  YG_COMPONENTS,
  YOUTUBE_TERMS_URL,
  type YGWidget,
} from '../youglish'

const ACCENTS = [
  { id: '', label: 'All' },
  { id: 'us', label: 'US' },
  { id: 'uk', label: 'UK' },
  { id: 'aus', label: 'AU' },
] as const

type Status = 'loading' | 'ready' | 'empty' | 'error'

/** Real people saying the word in YouTube videos, via YouGlish. */
export function YouGlishPanel({ word }: { word: string }) {
  const consent = useYouGlishConsent()
  return (
    <div className="youglish">
      {consent ? <Widget word={word} /> : <ConsentCard word={word} />}
      <p className="youglish-legal faint">
        Clips from YouTube ·{' '}
        <a href={YOUTUBE_TERMS_URL} target="_blank" rel="noreferrer">YouTube Terms</a> ·{' '}
        <a href={GOOGLE_PRIVACY_URL} target="_blank" rel="noreferrer">Google Privacy</a>
      </p>
    </div>
  )
}

function ConsentCard({ word }: { word: string }) {
  return (
    <div className="consent">
      <Clapperboard size={28} />
      <div>
        <p>
          Hear <b>“{word}”</b> in real conversations. The clips come from YouTube, which may set cookies on your
          device.
        </p>
        <button className="btn btn-marker" onClick={() => setYouGlishConsent(true)}>
          Allow and show videos
        </button>
        <p className="faint consent-note">You can turn this off again in Settings.</p>
      </div>
    </div>
  )
}

function Widget({ word }: { word: string }) {
  const host = useRef<HTMLDivElement>(null)
  const widget = useRef<YGWidget>(null)
  const elementId = `yg-${useId().replace(/[^a-z0-9]/gi, '')}`
  const [accent, setAccent] = useState<string>('')
  const [status, setStatus] = useState<Status>('loading')
  const [track, setTrack] = useState({ current: 0, total: 0 })

  // Create the widget once. YouGlish replaces the element it is given, so it gets
  // a child that React doesn't manage.
  useEffect(() => {
    let cancelled = false
    const target = document.createElement('div')
    target.id = elementId
    host.current?.appendChild(target)

    loadYouGlish()
      .then((YG) => {
        if (cancelled) return
        const css = getComputedStyle(document.documentElement)
        const color = (name: string) => css.getPropertyValue(name).trim()
        widget.current = new YG.Widget(elementId, {
          components: YG_COMPONENTS.caption + YG_COMPONENTS.speed + YG_COMPONENTS.controls,
          autoStart: 0,
          backgroundColor: color('--card'),
          textColor: color('--ink-2'),
          linkColor: color('--accent'),
          captionColor: color('--ink'),
          keywordColor: color('--accent'),
          queryColor: color('--accent'),
          markerColor: color('--marker'),
          panelsBackgroundColor: color('--paper'),
          events: {
            onFetchDone: (e) => {
              const total = e.totalResult ?? 0
              setTrack({ current: total ? 1 : 0, total })
              setStatus(total ? 'ready' : 'empty')
            },
            onVideoChange: (e) => setTrack((t) => ({ ...t, current: e.trackNumber ?? t.current })),
            onError: () => setStatus('error'),
          },
        })
        widget.current.fetch(word, 'english')
      })
      .catch(() => !cancelled && setStatus('error'))

    const hostEl = host.current
    return () => {
      cancelled = true
      // YouGlish's close() looks the element up by id and empties it. When the panel is
      // being removed, React has already detached that element, so close() would throw
      // on null and take the whole page down. Without the element there is nothing left
      // to close: the video iframe went with it.
      if (document.getElementById(elementId)) {
        try {
          widget.current?.close()
        } catch {
          // the widget is gone either way
        }
      }
      widget.current = null
      if (hostEl) hostEl.innerHTML = ''
    }
  }, [elementId, word])

  function changeAccent(id: string) {
    setAccent(id)
    setStatus('loading')
    widget.current?.fetch(word, 'english', id || undefined)
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="youglish-bar">
        <div className="row" role="group" aria-label="Accent" style={{ gap: 4 }}>
          {ACCENTS.map((a) => (
            <button key={a.id} className="chip" aria-pressed={accent === a.id} onClick={() => changeAccent(a.id)}>
              {a.label}
            </button>
          ))}
        </div>
        {status === 'ready' && (
          <div className="row" style={{ gap: 2 }}>
            <span className="faint track">
              {track.current} / {track.total.toLocaleString('en-US')}
            </span>
            <button className="icon-btn" aria-label="Previous video" onClick={() => widget.current?.previous()}>
              <ChevronLeft size={18} />
            </button>
            <button className="icon-btn" aria-label="Replay" onClick={() => widget.current?.replay()}>
              <RotateCcw size={15} />
            </button>
            <button className="icon-btn" aria-label="Next video" onClick={() => widget.current?.next()}>
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>
      {status === 'loading' && (
        <p className="row faint">
          <span className="spinner" /> Finding videos…
        </p>
      )}
      {status === 'empty' && <p className="faint">No videos found for “{word}”{accent && ' with this accent'}.</p>}
      {status === 'error' && <p className="faint">Videos can't be loaded right now.</p>}
      {/* hidden only when there is nothing to show: YouGlish sizes itself from a visible container */}
      <div ref={host} className="youglish-host" hidden={status === 'empty' || status === 'error'} />
    </div>
  )
}

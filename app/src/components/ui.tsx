import { Mic, Snail, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { bandOf, bandOfWord, describeLevel, formatLevel, levelOf, useLevelsReady } from '../data/levels'
import { describeFrequency, useWordFrequency } from '../data/wordFrequency'
import { EXPOSURE_LABELS, EXPOSURE_LEVELS, exposureOf, exposureSummary } from '../data/exposure'
import type { Entry } from '../data/model'
import { canSpeak, speak, useSpeaking } from '../speech'

/** CSS class that paints an element in its K band's colours. */
export function toneClass(word: string): string {
  return `tone-${bandOfWord(word) ?? 'unknown'}`
}

/**
 * "4K" = the word's family is among the 4,000 most common (BNC/COCA lists).
 * Hovering or focusing it explains that; `plain` is for use inside other buttons.
 */
export function KBadge({ word, large, plain }: { word: string; large?: boolean; plain?: boolean }) {
  useLevelsReady()
  const perMillion = useWordFrequency(word)
  const level = levelOf(word)
  if (!level) return null
  const label = formatLevel(level)
  const description = describeLevel(level)
  const usage = perMillion === undefined ? undefined : describeFrequency(perMillion)
  const tone = `tone-${bandOf(level)}`
  if (plain)
    return (
      <span className={`k-badge ${tone}`} title={usage ? `${description}. ${usage}.` : description}>
        {label}
      </span>
    )
  return (
    <span className={`tip ${large ? 'tip-below' : ''}`} tabIndex={0} aria-label={`${label}: ${description}`}>
      <span className={`k-badge ${tone} ${large ? 'k-badge-lg' : ''}`} aria-hidden>
        {label}
      </span>
      <span className="tip-bubble" role="tooltip">
        <strong>{description}</strong>
        {level.family && <span>Word family: {level.family}</span>}
        {usage && <span>{usage}</span>}
      </span>
    </span>
  )
}

/**
 * Exposure, quietly: five small dots that fill as you spend time with the word.
 * The tooltip says what it is made of.
 */
export function ExposureMeter({ entry }: { entry: Entry }) {
  const x = exposureOf(entry)
  const label = EXPOSURE_LABELS[x.level]
  return (
    <span className="exposure-meter" data-level={x.level} title={`${label} · ${exposureSummary(entry, x)}`} aria-label={`Exposure: ${label}`}>
      {EXPOSURE_LEVELS.map((l) => (
        <span key={l} />
      ))}
    </span>
  )
}

/** Reads text aloud with the browser's text-to-speech. */
export function SpeakButton({ text, slow, size = 'sm', label }: { text: string; slow?: boolean; size?: 'sm' | 'lg'; label?: string }) {
  const speaking = useSpeaking()
  if (!canSpeak) return null
  const active = speaking === (slow ? `${text}#slow` : text)
  const name = label ?? (slow ? `Say “${text}” slowly` : `Say “${text}”`)
  return (
    <button
      type="button"
      className={`speak-btn speak-${size}`}
      data-active={active}
      aria-label={name}
      title={name}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        speak(text, { slow })
      }}
    >
      {slow ? <Snail size={size === 'lg' ? 18 : 14} /> : <Volume2 size={size === 'lg' ? 18 : 14} />}
    </button>
  )
}

/** Plays the human recording from Free Dictionary, when there is one. */
export function RecordingButton({ url, word }: { url: string; word: string }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const label = `Play a recording of “${word}”`
  return (
    <>
      <button
        type="button"
        className="speak-btn speak-lg"
        data-active={playing}
        aria-label={label}
        title={label}
        onClick={() => {
          if (!audio.current) return
          audio.current.currentTime = 0
          void audio.current.play()
        }}
      >
        <Mic size={18} />
      </button>
      <audio ref={audio} src={url} preload="none" onPlay={() => setPlaying(true)} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} />
    </>
  )
}

/**
 * The signed-in user's Google photo. If there is none, or it fails to load (Google's
 * image server sometimes refuses), the first letter of their name on the accent colour.
 */
export function Avatar({ user, className = '' }: { user?: { name?: string; email?: string; picture?: string }; className?: string }) {
  const [failed, setFailed] = useState(false)
  const initial = (user?.name ?? user?.email ?? '').trim().charAt(0).toUpperCase()
  useEffect(() => setFailed(false), [user?.picture])
  if (user?.picture && !failed)
    return <img className={`avatar ${className}`} src={user.picture} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  return (
    <span className={`avatar avatar-initial ${className}`} aria-hidden>
      {initial}
    </span>
  )
}

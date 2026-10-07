import { motion } from 'motion/react'
import { Mic, Snail, Volume2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { bandOf, bandOfWord, describeLevel, formatLevel, levelOf, useLevelsReady } from '../data/levels'
import { MASTERY_HINTS, MASTERY_LABELS, MASTERY_LEVELS, type Mastery } from '../data/model'
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
  const level = levelOf(word)
  if (!level) return null
  const label = formatLevel(level)
  const description = describeLevel(level)
  const tone = `tone-${bandOf(level)}`
  if (plain)
    return (
      <span className={`k-badge ${tone}`} title={description}>
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
        <span>BNC/COCA word family lists</span>
      </span>
    </span>
  )
}

export function MasteryMeter({ level }: { level: Mastery }) {
  return (
    <span
      className="mastery-meter"
      data-level={level}
      style={{ color: `var(--mastery-${level})` }}
      title={`${MASTERY_LABELS[level]}: ${MASTERY_HINTS[level]}`}
      aria-label={`Mastery: ${MASTERY_LABELS[level]}`}
    >
      <span />
      <span />
      <span />
    </span>
  )
}

/** Segmented control with a sliding thumb. */
export function MasteryControl({ value, onChange }: { value: Mastery; onChange: (m: Mastery) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="How well do you know this word?">
      {MASTERY_LEVELS.map((m) => (
        <button key={m} role="radio" aria-checked={value === m} data-level={m} title={MASTERY_HINTS[m]} onClick={() => onChange(m)}>
          {value === m && (
            <motion.span layoutId="mastery-thumb" className="segmented-thumb" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />
          )}
          <span className="segmented-label">{MASTERY_LABELS[m]}</span>
        </button>
      ))}
    </div>
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

import { AnimatePresence, motion } from 'motion/react'
import { BellRing, Check, Clapperboard, Cloud, Database, ExternalLink, Info, Monitor, Moon, Palette, RefreshCw, Sun, Volume2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { enrichEntry } from '../api/enrich'
import { useAppState } from '../app/state'
import { AccountCard } from '../components/AccountCard'
import { isEnrichmentCurrent, type Entry } from '../data/model'
import { REMINDER_MIN_WORDS, setRemindersEnabled, useRemindersEnabled } from '../data/reminders'
import { canSpeak, setSpeechPrefs, speak, useEnglishVoices, useSpeechPrefs } from '../speech'
import { ACCENT_PRESETS, DEFAULT_ACCENT, inkOn, setAccent, setThemePref, setWordColors, useAccent, useThemePref, useWordColors, type ThemePref, type WordColors } from '../theme'
import { GOOGLE_PRIVACY_URL, setYouGlishConsent, useYouGlishConsent, YOUTUBE_TERMS_URL } from '../youglish'

const CREATOR_INSTAGRAM = 'https://instagram.com/dmrgveli'
const SOURCE_CODE = 'https://github.com/dmrgveli/vocabook'

const SECTIONS = [
  { id: 'account', label: 'Account & sync', icon: <Cloud size={17} /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={17} /> },
  { id: 'pronunciation', label: 'Pronunciation', icon: <Volume2 size={17} /> },
  { id: 'reminders', label: 'Reminders', icon: <BellRing size={17} /> },
  { id: 'videos', label: 'Videos', icon: <Clapperboard size={17} /> },
  { id: 'data', label: 'Your data', icon: <Database size={17} /> },
  { id: 'about', label: 'About', icon: <Info size={17} /> },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

/** Settings: a list of sections on the left (tabs on top on phones) and one section at a time. */
export function Settings({ entries }: { entries: Entry[] }) {
  const { section } = useParams()
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]

  // On phones the sections are a row of tabs that scrolls sideways: keep the open one in view.
  useEffect(() => {
    document.querySelector('.settings-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [current.id])

  return (
    <div className="page settings">
      <header className="page-header">
        <h1 className="page-title">
          <span className="marked">Settings</span>
        </h1>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <NavLink
              key={s.id}
              to={`/settings/${s.id}`}
              className={s.id === current.id ? 'settings-tab active' : 'settings-tab'}
              aria-current={s.id === current.id ? 'page' : undefined}
            >
              {s.icon}
              <span>{s.label}</span>
            </NavLink>
          ))}
        </nav>

        <AnimatePresence mode="wait">
          <motion.section
            key={current.id}
            className="settings-panel box"
            aria-labelledby="settings-title"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <h2 id="settings-title" className="settings-title">
              {current.label}
            </h2>
            <SectionBody id={current.id} entries={entries} />
          </motion.section>
        </AnimatePresence>
      </div>
    </div>
  )
}

function SectionBody({ id, entries }: { id: SectionId; entries: Entry[] }) {
  switch (id) {
    case 'account':
      return <AccountCard />
    case 'appearance':
      return <AppearanceSettings />
    case 'pronunciation':
      return <PronunciationSettings />
    case 'reminders':
      return <ReminderSettings />
    case 'videos':
      return <VideoSettings />
    case 'data':
      return <DataSettings entries={entries} />
    case 'about':
      return <About />
  }
}

/** A titled row inside a settings section: explanation on the left, control on the right. */
function Field({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="setting-text">
        <h3>{title}</h3>
        {hint && <p className="muted small">{hint}</p>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

const THEMES: { id: ThemePref; label: string; icon: ReactNode }[] = [
  { id: 'system', label: 'System', icon: <Monitor size={15} /> },
  { id: 'light', label: 'Light', icon: <Sun size={15} /> },
  { id: 'dark', label: 'Dark', icon: <Moon size={15} /> },
]

function AppearanceSettings() {
  const pref = useThemePref()
  return (
    <>
      <Field title="Theme" hint="System follows your device's light or dark setting.">
        <div className="choice" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button key={t.id} role="radio" aria-checked={pref === t.id} className="choice-btn" onClick={() => setThemePref(t.id)}>
              {pref === t.id && (
                <motion.span layoutId="theme-thumb" className="choice-thumb" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />
              )}
              <span className="choice-label">
                {t.icon} {t.label}
              </span>
            </button>
          ))}
        </div>
      </Field>
      <AccentField />
      <WordColorsField />
    </>
  )
}

const WORD_COLOR_CHOICES: { id: WordColors; label: string; swatches: string[] }[] = [
  { id: 'level', label: 'By level', swatches: ['var(--k1)', 'var(--k3)', 'var(--k5)', 'var(--k10)'] },
  { id: 'calm', label: 'Calm', swatches: ['var(--calm)', 'var(--calm)', 'var(--calm)', 'var(--calm)'] },
]

/** Colourful word cards (by how common the word is) or one calm colour for all. */
function WordColorsField() {
  const value = useWordColors()
  return (
    <Field title="Word card colours" hint="By level colours each card by how common the word is. Calm gives every card one quiet colour; the small level badges stay coloured.">
      <div className="choice choice-2" role="radiogroup" aria-label="Word card colours">
        {WORD_COLOR_CHOICES.map((c) => (
          <button key={c.id} role="radio" aria-checked={value === c.id} className="choice-btn" onClick={() => setWordColors(c.id)}>
            {value === c.id && (
              <motion.span layoutId="word-colors-thumb" className="choice-thumb" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />
            )}
            <span className="choice-label">
              <span className="mini-swatches" aria-hidden>
                {c.swatches.map((bg, i) => (
                  <i key={i} style={{ background: bg }} />
                ))}
              </span>
              {c.label}
            </span>
          </button>
        ))}
      </div>
    </Field>
  )
}

/** The highlighter colour: a few presets that work on paper in light and dark, or any colour. */
function AccentField() {
  const accent = useAccent()
  const custom = !ACCENT_PRESETS.some((p) => p.color === accent)
  return (
    <Field
      title="Accent colour"
      hint={
        <>
          The highlighter: main buttons, highlights and stickers. Word-level colours stay as they are.
          {accent !== DEFAULT_ACCENT && (
            <>
              {' '}
              <button className="link-btn" onClick={() => setAccent(DEFAULT_ACCENT)}>
                Back to yellow
              </button>
            </>
          )}
        </>
      }
    >
      <div className="swatches" role="radiogroup" aria-label="Accent colour">
        {ACCENT_PRESETS.map((p) => (
          <button
            key={p.color}
            role="radio"
            aria-checked={accent === p.color}
            aria-label={p.name}
            title={p.name}
            className="swatch"
            style={{ '--swatch': p.color, color: inkOn(p.color) } as React.CSSProperties}
            onClick={() => setAccent(p.color)}
          >
            {accent === p.color && <Check size={15} strokeWidth={3} />}
          </button>
        ))}
        <label
          className="swatch swatch-custom"
          data-checked={custom}
          title="Pick any colour"
          style={(custom ? { '--swatch': accent, color: inkOn(accent) } : {}) as React.CSSProperties}
        >
          {custom ? <Check size={15} strokeWidth={3} /> : <Palette size={15} />}
          <input type="color" aria-label="Pick any colour" value={accent} onChange={(e) => setAccent(e.target.value)} />
        </label>
      </div>
    </Field>
  )
}

function PronunciationSettings() {
  const voices = useEnglishVoices()
  const prefs = useSpeechPrefs()
  if (!canSpeak) return <p className="muted">This browser can't read words aloud.</p>
  const current = voices.find((v) => v.voiceURI === prefs.voiceURI) ?? voices[0]
  return (
    <>
      <Field title="Voice" hint="Words are read aloud by your browser's own voices.">
        <select
          className="field"
          value={current?.voiceURI ?? ''}
          onChange={(e) => {
            setSpeechPrefs({ voiceURI: e.target.value })
            speak('Hello, this is how I sound.', { voiceURI: e.target.value })
          }}
        >
          {voices.length === 0 && <option value="">Loading voices…</option>}
          {voices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name} · {v.lang}
              {v.localService ? '' : ' · online'}
            </option>
          ))}
        </select>
      </Field>
      <Field title="Speed" hint={`${prefs.rate.toFixed(2)}× · the snail button always reads slower.`}>
        <div className="row" style={{ flexWrap: 'nowrap', gap: 12 }}>
          <input
            type="range"
            className="range"
            min={0.5}
            max={1.4}
            step={0.05}
            value={prefs.rate}
            aria-label="Speed"
            onChange={(e) => setSpeechPrefs({ rate: Number(e.target.value) })}
          />
          <button className="btn" onClick={() => speak('The quick brown fox jumps over the lazy dog.')}>
            <Volume2 size={15} /> Test
          </button>
        </div>
      </Field>
    </>
  )
}

function ReminderSettings() {
  const enabled = useRemindersEnabled()
  return (
    <Field
      title="A page from your notebook"
      hint={`Once your notebook has ${REMINDER_MIN_WORDS} words, opening the app shows a few you haven't looked at in a while. Close it any time; nothing is scored.`}
    >
      <label className="row toggle">
        <input type="checkbox" checked={enabled} onChange={(e) => setRemindersEnabled(e.target.checked)} />
        Show when I open the app
      </label>
    </Field>
  )
}

function VideoSettings() {
  const consent = useYouGlishConsent()
  return (
    <Field
      title="Real-world videos"
      hint={
        <>
          Word pages can play short clips of people saying the word. The clips come from YouTube, which may set cookies.{' '}
          <a href={YOUTUBE_TERMS_URL} target="_blank" rel="noreferrer">
            YouTube Terms
          </a>{' '}
          ·{' '}
          <a href={GOOGLE_PRIVACY_URL} target="_blank" rel="noreferrer">
            Google Privacy
          </a>
        </>
      }
    >
      <button className={consent ? 'btn' : 'btn btn-marker'} onClick={() => setYouGlishConsent(!consent)}>
        {consent ? 'Turn off videos' : 'Allow videos'}
      </button>
    </Field>
  )
}

function DataSettings({ entries }: { entries: Entry[] }) {
  const { toast } = useAppState()
  const missing = entries.filter((e) => !isEnrichmentCurrent(e.enrichment) || e.enrichment.definitionsFrom !== 'free-dictionary')
  const [refreshing, setRefreshing] = useState(false)

  async function refetch() {
    setRefreshing(true)
    const results = await Promise.allSettled(missing.map((e) => enrichEntry(e.id)))
    setRefreshing(false)
    const failed = results.filter((r) => r.status === 'rejected').length
    toast(failed ? `${failed} words could not be updated` : 'Definitions refreshed')
  }

  return (
    <Field
      title={`${entries.length} ${entries.length === 1 ? 'word' : 'words'} on this device`}
      hint="Everything is saved in this browser first. Definitions are copied into each word, so the notebook keeps working offline; each device fetches its own."
    >
      {missing.length > 0 ? (
        <button className="btn" onClick={refetch} disabled={refreshing}>
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          Refresh {missing.length} {missing.length === 1 ? 'definition' : 'definitions'}
        </button>
      ) : (
        <span className="faint small">All definitions are up to date.</span>
      )}
    </Field>
  )
}

/* ---------- about ---------- */

interface Credit {
  name: string
  href: string
  what: string
  license?: string
}

const CREDITS: { group: string; items: Credit[] }[] = [
  {
    group: 'Words and data',
    items: [
      { name: 'Free Dictionary API', href: 'https://dictionaryapi.dev/', what: 'Definitions, examples, recordings and origins, from Wiktionary', license: 'CC BY-SA' },
      { name: 'Datamuse API', href: 'https://www.datamuse.com/api/', what: 'Suggestions, words used together, related words, backup definitions' },
      {
        name: 'BNC/COCA word family lists',
        href: 'https://www.wgtn.ac.nz/lals/resources/paul-nations-resources/vocabulary-analysis-programs',
        what: 'The 1K–25K levels. Nation, I.S.P. (2017), Victoria University of Wellington',
        license: 'CC BY-SA 4.0',
      },
      { name: 'YouGlish', href: 'https://youglish.com/', what: 'Pronunciation in real YouTube videos' },
    ],
  },
  {
    group: 'Account and sync',
    items: [
      { name: 'Google Identity Services', href: 'https://developers.google.com/identity/gsi/web', what: 'Sign in with Google' },
      { name: 'Cloudflare Workers & R2', href: 'https://developers.cloudflare.com/workers/', what: 'Keeps your notebook in sync' },
    ],
  },
  {
    group: 'Design and code',
    items: [
      { name: 'Instrument Serif', href: 'https://fonts.google.com/specimen/Instrument+Serif', what: 'Typeface for words', license: 'SIL OFL' },
      { name: 'Bricolage Grotesque', href: 'https://fonts.google.com/specimen/Bricolage+Grotesque', what: 'Typeface for the interface', license: 'SIL OFL' },
      { name: 'Lucide', href: 'https://lucide.dev/', what: 'Icons', license: 'ISC' },
      { name: 'React, Vite, Motion', href: 'https://react.dev/', what: 'Built with', license: 'MIT' },
    ],
  },
]

/** Outline camera glyph used for the Instagram link (the icon set has no brand logos). */
function InstagramGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="0.6" fill="currentColor" />
    </svg>
  )
}

function About() {
  return (
    <div className="about">
      <div className="about-intro">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={56} height={56} className="about-logo" />
        <div>
          <h3 className="about-name">Vocabook</h3>
          <p className="muted">A living vocabulary notebook: every word you met, where you met it.</p>
        </div>
      </div>

      <a className="creator" href={CREATOR_INSTAGRAM} target="_blank" rel="noreferrer">
        <span className="creator-icon">
          <InstagramGlyph />
        </span>
        <span className="creator-text">
          <span className="faint small">Made by</span>
          <strong>@dmrgveli</strong>
        </span>
        <span className="creator-badge">Creator</span>
        <ExternalLink size={14} className="faint" />
      </a>

      {CREDITS.map((g) => (
        <section key={g.group} className="credits">
          <h3 className="label-sm">{g.group}</h3>
          <ul>
            {g.items.map((c) => (
              <li key={c.name}>
                <a href={c.href} target="_blank" rel="noreferrer">
                  {c.name} <ExternalLink size={11} />
                </a>
                <span className="faint small">
                  {c.what}
                  {c.license && <span className="license">{c.license}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="faint small">
        Open source on{' '}
        <a href={SOURCE_CODE} target="_blank" rel="noreferrer">
          GitHub
        </a>
        . A word's level is the thousand its word family falls in on the BNC/COCA lists; 25K+ means it is not on them.
      </p>
    </div>
  )
}

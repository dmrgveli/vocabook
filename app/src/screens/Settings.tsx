import { motion } from 'motion/react'
import { BookA, Cloud, Database, ExternalLink, RefreshCw, Volume2, Clapperboard } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { enrichEntry } from '../api/enrich'
import { useAppState } from '../app/state'
import type { Entry } from '../data/model'
import { canSpeak, setSpeechPrefs, speak, useEnglishVoices, useSpeechPrefs } from '../speech'
import { GOOGLE_PRIVACY_URL, setYouGlishConsent, useYouGlishConsent, YOUTUBE_TERMS_URL } from '../youglish'

export function Settings({ entries }: { entries: Entry[] }) {
  const { toast } = useAppState()
  const missing = entries.filter((e) => !e.enrichment || e.enrichment.definitionsFrom !== 'free-dictionary' || !e.enrichment.collocations.adjectives)
  const [refreshing, setRefreshing] = useState(false)

  async function refetch() {
    setRefreshing(true)
    const results = await Promise.allSettled(missing.map((e) => enrichEntry(e.id)))
    setRefreshing(false)
    const failed = results.filter((r) => r.status === 'rejected').length
    toast(failed ? `${failed} words could not be updated` : 'Dictionary data updated')
  }

  return (
    <div className="page settings">
      <header className="page-header">
        <h1 className="page-title">
          <span className="marked">Settings</span>
        </h1>
      </header>

      <div className="settings-grid">
        <Card icon={<Volume2 size={18} />} title="Pronunciation" index={0}>
          <PronunciationSettings />
        </Card>

        <Card icon={<Clapperboard size={18} />} title="Real-world videos" index={1}>
          <YouGlishSettings />
        </Card>

        <Card icon={<Database size={18} />} title="Storage" index={2}>
          <p className="muted">
            {entries.length} {entries.length === 1 ? 'word' : 'words'} saved on this device. Dictionary data is copied into each
            word, so your notebook keeps working offline.
          </p>
          {missing.length > 0 && (
            <button className="btn" onClick={refetch} disabled={refreshing}>
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
              Update dictionary data for {missing.length} {missing.length === 1 ? 'word' : 'words'}
            </button>
          )}
        </Card>

        <Card icon={<Cloud size={18} />} title="Account & sync" index={3}>
          <p className="muted">
            Your notebook lives in this browser for now. Google sign-in and sync across devices are coming in a later version.
          </p>
          <span className="chip">Not signed in</span>
        </Card>

        <Card icon={<BookA size={18} />} title="Data sources" index={4}>
          <ul className="sources">
            <SourceLink href="https://dictionaryapi.dev/" name="Free Dictionary API" what="Definitions, examples, recordings, origin" />
            <SourceLink href="https://www.datamuse.com/api/" name="Datamuse" what="Suggestions, frequency, collocations, related words" />
            <SourceLink href="https://youglish.com/" name="YouGlish" what="Pronunciation in real YouTube videos" />
          </ul>
          <p className="faint small">
            The 1K–40K ranks are estimated from Datamuse frequencies, calibrated against the OpenSubtitles 50k word list.
          </p>
        </Card>
      </div>
    </div>
  )
}

function PronunciationSettings() {
  const voices = useEnglishVoices()
  const prefs = useSpeechPrefs()
  if (!canSpeak) return <p className="muted">This browser has no text-to-speech.</p>
  const current = voices.find((v) => v.voiceURI === prefs.voiceURI) ?? voices[0]
  return (
    <>
      <p className="muted">Words are read aloud by your browser's built-in voices.</p>
      <label className="label">
        Voice
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
      </label>
      <label className="label">
        <span>
          Speed <span className="optional">· {prefs.rate.toFixed(2)}×</span>
        </span>
        <input
          type="range"
          className="range"
          min={0.5}
          max={1.4}
          step={0.05}
          value={prefs.rate}
          onChange={(e) => setSpeechPrefs({ rate: Number(e.target.value) })}
        />
      </label>
      <button className="btn" onClick={() => speak('The quick brown fox jumps over the lazy dog.')}>
        <Volume2 size={15} /> Test
      </button>
    </>
  )
}

function YouGlishSettings() {
  const consent = useYouGlishConsent()
  return (
    <>
      <p className="muted">
        Word pages can show clips of people saying the word, loaded from YouGlish and YouTube. They may set cookies.
      </p>
      <p className="faint small">
        <a href={YOUTUBE_TERMS_URL} target="_blank" rel="noreferrer">YouTube Terms of Service</a> ·{' '}
        <a href={GOOGLE_PRIVACY_URL} target="_blank" rel="noreferrer">Google Privacy Policy</a>
      </p>
      <button className={consent ? 'btn' : 'btn btn-marker'} onClick={() => setYouGlishConsent(!consent)}>
        {consent ? 'Turn off videos' : 'Allow videos'}
      </button>
    </>
  )
}

function SourceLink({ href, name, what }: { href: string; name: string; what: string }) {
  return (
    <li>
      <a href={href} target="_blank" rel="noreferrer">
        {name} <ExternalLink size={12} />
      </a>
      <span className="faint">{what}</span>
    </li>
  )
}

function Card({ icon, title, children, index }: { icon: ReactNode; title: string; children: ReactNode; index: number }) {
  return (
    <motion.section
      className="panel box settings-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="settings-card-head">
        <span className="settings-icon">{icon}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </motion.section>
  )
}

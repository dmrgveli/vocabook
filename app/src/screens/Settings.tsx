import { motion } from 'motion/react'
import { BellRing, BookA, Clapperboard, Cloud, Database, ExternalLink, RefreshCw, Volume2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { enrichEntry } from '../api/enrich'
import { useAppState } from '../app/state'
import { AccountCard } from '../components/AccountCard'
import { isEnrichmentCurrent, type Entry } from '../data/model'
import { REMINDER_MIN_WORDS, setRemindersEnabled, useRemindersEnabled } from '../data/reminders'
import { canSpeak, setSpeechPrefs, speak, useEnglishVoices, useSpeechPrefs } from '../speech'
import { GOOGLE_PRIVACY_URL, setYouGlishConsent, useYouGlishConsent, YOUTUBE_TERMS_URL } from '../youglish'

export function Settings({ entries }: { entries: Entry[] }) {
  const { toast } = useAppState()
  const missing = entries.filter((e) => !isEnrichmentCurrent(e.enrichment) || e.enrichment.definitionsFrom !== 'free-dictionary')
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
        <Card icon={<Cloud size={18} />} title="Account & sync" index={0}>
          <AccountCard />
        </Card>

        <Card icon={<Volume2 size={18} />} title="Pronunciation" index={1}>
          <PronunciationSettings />
        </Card>

        <Card icon={<BellRing size={18} />} title="Reminders" index={2}>
          <ReminderSettings />
        </Card>

        <Card icon={<Clapperboard size={18} />} title="Real-world videos" index={3}>
          <YouGlishSettings />
        </Card>

        <Card icon={<Database size={18} />} title="Storage" index={4}>
          <p className="muted">
            {entries.length} {entries.length === 1 ? 'word' : 'words'} saved on this device. Dictionary data is copied into each
            word, so your notebook keeps working offline. It is not synced: each computer fetches its own.
          </p>
          {missing.length > 0 && (
            <button className="btn" onClick={refetch} disabled={refreshing}>
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
              Update dictionary data for {missing.length} {missing.length === 1 ? 'word' : 'words'}
            </button>
          )}
        </Card>


        <Card icon={<BookA size={18} />} title="Data sources" index={5}>
          <ul className="sources">
            <SourceLink href="https://dictionaryapi.dev/" name="Free Dictionary API" what="Definitions, examples, recordings, origin" />
            <SourceLink href="https://www.datamuse.com/api/" name="Datamuse" what="Suggestions, collocations, related words, backup definitions" />
            <SourceLink
              href="https://www.wgtn.ac.nz/lals/resources/paul-nations-resources/vocabulary-analysis-programs"
              name="BNC/COCA word family lists"
              what="The 1K–25K levels. I.S.P. Nation, Victoria University of Wellington, CC BY-SA 4.0"
            />
            <SourceLink href="https://youglish.com/" name="YouGlish" what="Pronunciation in real YouTube videos" />
          </ul>
          <p className="faint small">
            A word's level (1K–25K) is the thousand its word family falls in on Nation's BNC/COCA lists; 25K+ means it is not on them.
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

function ReminderSettings() {
  const enabled = useRemindersEnabled()
  return (
    <>
      <p className="muted">
        Once your notebook has {REMINDER_MIN_WORDS} words, opening the app shows a few you haven't looked at in a while. Close it
        any time; nothing is scored.
      </p>
      <label className="row toggle">
        <input type="checkbox" checked={enabled} onChange={(e) => setRemindersEnabled(e.target.checked)} />
        Show “A page from your notebook” when I open the app
      </label>
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

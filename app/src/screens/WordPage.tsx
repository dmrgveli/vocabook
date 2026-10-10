import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppState } from '../app/state'
import { EditableText } from '../components/EditableText'
import { ExposureMeter, SpeakButton } from '../components/ui'
import { EXPOSURE_LABELS, exposureLevel, exposureSummary } from '../data/exposure'
import { deleteEntry, markViewed, updateEntry } from '../data/db'
import { alive, type Entry } from '../data/model'
import { parseWordParam, wordPath } from '../data/paths'
import { useEntryAt } from '../hooks'
import { Dictionary } from './word/DictionaryPanels'
import { BackLink } from './word/Panel'
import { Encounters, formatDate, Notes, type Update } from './word/PersonalPanels'
import { VideosDrawer, WordHeading } from './word/WordHeading'
import { SectionNav } from './word/SectionNav'
import { scheduleOf, whenLabel } from '../data/srs'

// A word in the notebook. The parts live in ./word/: the heading, the dictionary panels
// (shared with look-ups in LookUpPage) and the personal panels.

/**
 * Your translation and your own sentence: small lines under the word, written straight
 * onto the page. They stay at hand without pushing the dictionary down.
 */
function MyWords({ entry, update }: { entry: Entry; update: Update }) {
  return (
    <div className="mine">
      <label className="mine-row">
        <span className="mine-label">Translation</span>
        <EditableText
          label="My translation"
          lang="tr"
          className="mine-edit mine-translation"
          value={entry.translation}
          placeholder="Write it in your own words…"
          onSave={(v) => update((x) => ({ ...x, translation: v }))}
        />
      </label>
      <div className="mine-row">
        <span className="mine-label">My sentence</span>
        <EditableText
          label="My sentence"
          lang="en"
          multiline
          className="mine-edit word-font"
          value={entry.ownSentence}
          placeholder="Try it in a sentence from your own life."
          onSave={(v) => update((x) => ({ ...x, ownSentence: v }))}
        />
        {entry.ownSentence && <SpeakButton text={entry.ownSentence} label="Read my sentence aloud" />}
      </div>
    </div>
  )
}

export function WordPage() {
  const { param } = useParams()
  const entry = useEntryAt(param)
  const navigate = useNavigate()

  useEffect(() => {
    // Desktop scrolls the main column; small screens scroll the page itself.
    document.querySelector('.main')?.scrollTo(0, 0)
    window.scrollTo(0, 0)
  }, [param])

  useEffect(() => {
    if (!entry) return
    void markViewed(entry.id, true)
    // Old links used the entry id; show the readable address instead.
    if (param && 'id' in parseWordParam(param)) navigate(wordPath(entry.word), { replace: true })
  }, [entry?.id])

  if (entry === undefined) return <div className="page" />
  if (entry === null)
    return (
      <div className="page">
        <BackLink />
        <p className="muted">This word is not in your notebook.</p>
      </div>
    )
  return <WordPageContent key={entry.id} entry={entry} />
}

function WordPageContent({ entry }: { entry: Entry }) {
  const navigate = useNavigate()
  const { toast } = useAppState()
  const update: Update = (change) => updateEntry(entry.id, change)
  const e = entry.enrichment
  const [videosOpen, setVideosOpen] = useState(false)

  async function remove() {
    if (!confirm(`Remove “${entry.word}” from your notebook?`)) return
    await deleteEntry(entry.id)
    toast(`“${entry.word}” removed`)
    navigate('/')
  }

  return (
    <div className="page word-page">
      <BackLink />

      <header className="word-hero">
        <div className="word-hero-main">
          <WordHeading word={entry.word} enrichment={e} videosOpen={videosOpen} onToggleVideos={() => setVideosOpen((o) => !o)} />
          <MyWords entry={entry} update={update} />
        </div>
        <div className="word-hero-side">
          <span className="word-exposure" title="Exposure: it grows each time you open the word, meet it somewhere new, practise it or write about it">
            <ExposureMeter entry={entry} /> {EXPOSURE_LABELS[exposureLevel(entry)]}
          </span>
          <span className="faint">{exposureSummary(entry)}</span>
          <span className="faint">Added {formatDate(entry.createdAt)}</span>
          <span className="faint" title="Spaced repetition: when Flashback will bring it back">Next review {whenLabel(scheduleOf(entry).due)}</span>
        </div>
      </header>

      <VideosDrawer word={entry.word} open={videosOpen} />

      <SectionNav word={entry.word} />

      <div className="word-columns">
        <div className="word-col">
          <Dictionary entry={entry} part="main" />
        </div>

        <div className="word-col">
          <Dictionary entry={entry} part="related" />
          <Encounters entry={entry} update={update} />
          <Notes notes={alive(entry.notes)} update={update} />
          <Dictionary entry={entry} part="origin" />

          <button className="btn btn-quiet btn-danger remove-btn" onClick={remove}>
            <Trash2 size={15} /> Remove from notebook
          </button>
        </div>
      </div>
    </div>
  )
}

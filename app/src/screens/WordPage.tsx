import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppState } from '../app/state'
import { EditableText } from '../components/EditableText'
import { MasteryControl, SpeakButton } from '../components/ui'
import { deleteEntry, markViewed, updateEntry } from '../data/db'
import { alive, type Entry } from '../data/model'
import { parseWordParam, wordPath } from '../data/paths'
import { useEntryAt } from '../hooks'
import { Dictionary } from './word/DictionaryPanels'
import { BackLink, Panel } from './word/Panel'
import { Encounters, formatDate, Notes, type Update } from './word/PersonalPanels'
import { VideosDrawer, WordHeading } from './word/WordHeading'

// A word in the notebook. The parts live in ./word/: the heading, the dictionary panels
// (shared with look-ups in LookUpPage) and the personal panels.

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
    void markViewed(entry.id)
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
        </div>
        <div className="word-hero-side">
          <span className="label-sm">How well do you know it?</span>
          <MasteryControl value={entry.mastery} onChange={(m) => update((x) => ({ ...x, mastery: m }))} />
          <span className="faint">Added {formatDate(entry.createdAt)}</span>
        </div>
      </header>

      <VideosDrawer word={entry.word} open={videosOpen} />

      <div className="word-columns">
        <div className="word-col">
          <Dictionary entry={entry} />
        </div>

        <div className="word-col">
          <Panel title="My translation" delay={0.05}>
            <EditableText
              label="My translation"
              lang="tr"
              className="edit-lg"
              value={entry.translation}
              placeholder="Write it in your own words…"
              onSave={(v) => update((x) => ({ ...x, translation: v }))}
            />
          </Panel>

          <Panel title="My sentence" delay={0.1} aside={entry.ownSentence && <SpeakButton text={entry.ownSentence} label="Read my sentence aloud" />}>
            <EditableText
              label="My sentence"
              lang="en"
              multiline
              value={entry.ownSentence}
              placeholder="Try using it in a sentence from your own life."
              onSave={(v) => update((x) => ({ ...x, ownSentence: v }))}
            />
          </Panel>

          <Encounters entry={entry} update={update} />
          <Notes notes={alive(entry.notes)} update={update} />

          <button className="btn btn-quiet btn-danger remove-btn" onClick={remove}>
            <Trash2 size={15} /> Remove from notebook
          </button>
        </div>
      </div>
    </div>
  )
}

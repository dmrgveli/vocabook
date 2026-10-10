import { AnimatePresence, motion } from 'motion/react'
import { ChevronUp, Orbit, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { KBadge, RecordingButton, SpeakButton } from '../../components/ui'
import { YouGlishPanel } from '../../components/YouGlishPanel'
import type { Enrichment } from '../../data/model'
import { ringsPath } from '../../data/paths'

/** The big word, its stickers and the pronunciation buttons. */
export function WordHeading({
  word,
  enrichment: e,
  videosOpen,
  onToggleVideos,
}: {
  word: string
  enrichment?: Enrichment
  videosOpen: boolean
  onToggleVideos: () => void
}) {
  return (
    <>
      <motion.div
        className="word-title-row"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      >
        <h1 className="word-font word-title" lang="en">
          {word}
        </h1>
        <motion.span
          className="title-badges"
          initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 14, delay: 0.15 }}
        >
          <KBadge word={word} large />
          <button type="button" className="video-badge" aria-expanded={videosOpen} aria-controls="word-videos" onClick={onToggleVideos}>
            {videosOpen ? <ChevronUp size={15} strokeWidth={2.5} /> : <Play size={14} strokeWidth={2.5} fill="currentColor" />}
            {videosOpen ? 'Hide videos' : 'Hear it used'}
          </button>
          {!word.includes(' ') && (
            <Link to={ringsPath(word)} className="pool-badge" title="See the words around it">
              <Orbit size={14} strokeWidth={2.5} /> Word rings
            </Link>
          )}
        </motion.span>
      </motion.div>
      <div className="row word-meta">
        <SpeakButton text={word} size="lg" />
        <SpeakButton text={word} size="lg" slow />
        {e?.audioUrl && <RecordingButton url={e.audioUrl} word={word} />}
        {e?.phonetic && <span className="phonetic-lg">{e.phonetic}</span>}
      </div>
    </>
  )
}

export function VideosDrawer({ word, open }: { word: string; open: boolean }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.section
          id="word-videos"
          className="videos-drawer"
          aria-label={`“${word}” in real videos`}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="videos-inner box">
            <ErrorBoundary fallback={<p className="faint">The videos stopped working. Close and open them again.</p>}>
              <YouGlishPanel word={word} />
            </ErrorBoundary>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  )
}

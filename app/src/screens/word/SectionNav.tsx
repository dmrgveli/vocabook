import { useEffect, useRef, useState } from 'react'
import { SpeakButton } from '../../components/ui'

// A bar that sticks to the top of a long word page: the word itself once its heading has
// scrolled away, and a link to each section, the one you're reading highlighted.

/** Section order as you'd read it; only sections present on the page are listed. */
const ORDER = ['Definitions', 'Used together with', 'In real sentences', 'Related words', 'Encounters', 'Notes', 'Origin']
const SHORT: Record<string, string> = { 'Used together with': 'Used with', 'In real sentences': 'Sentences', 'Related words': 'Related' }

export function SectionNav({ word }: { word: string }) {
  const bar = useRef<HTMLElement>(null)
  const [sections, setSections] = useState<string[]>([])
  const [active, setActive] = useState<string>()
  const [compact, setCompact] = useState(false)

  // Panels appear as their data arrives: keep the list in step with the page.
  useEffect(() => {
    const page = bar.current?.closest('.page')
    if (!page) return
    const read = () => {
      const present = new Set([...page.querySelectorAll<HTMLElement>('[data-section]')].map((p) => p.dataset.section!))
      setSections((cur) => {
        const next = ORDER.filter((s) => present.has(s))
        return next.join() === cur.join() ? cur : next
      })
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(page, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [])

  // The section in view, and whether the big heading has scrolled out of sight.
  useEffect(() => {
    const page = bar.current?.closest('.page')
    if (!page) return
    const io = new IntersectionObserver(
      (seen) => {
        const visible = seen.filter((s) => s.isIntersecting).map((s) => (s.target as HTMLElement).dataset.section!)
        if (visible.length) setActive(ORDER.find((o) => visible.includes(o)))
      },
      { rootMargin: '-25% 0px -55% 0px' },
    )
    page.querySelectorAll('[data-section]').forEach((p) => io.observe(p))
    const title = page.querySelector('.word-title')
    const titleIo = new IntersectionObserver(([t]) => setCompact(!t.isIntersecting), { rootMargin: '-60px 0px 0px 0px' })
    if (title) titleIo.observe(title)
    return () => {
      io.disconnect()
      titleIo.disconnect()
    }
  }, [sections])

  const go = (s: string) => {
    const page = bar.current?.closest('.page')
    page?.querySelector<HTMLElement>(`[data-section="${s}"]`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }

  if (sections.length < 2) return <nav ref={bar} className="section-nav is-empty" aria-hidden />
  return (
    <nav ref={bar} className={compact ? 'section-nav is-compact' : 'section-nav'} aria-label="Sections of this page">
      <span className="section-nav-word word-font" lang="en" aria-hidden={!compact}>
        <span className="truncate">{word}</span>
        <SpeakButton text={word} />
      </span>
      <div className="section-nav-links">
        {sections.map((s) => (
          <button key={s} type="button" className="section-link" aria-current={active === s ? 'true' : undefined} onClick={() => go(s)}>
            {SHORT[s] ?? s}
          </button>
        ))}
      </div>
    </nav>
  )
}

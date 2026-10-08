import { motion } from 'motion/react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

/** A titled box on the word page. */
export function Panel({ title, children, delay = 0, aside }: { title: string; children: React.ReactNode; delay?: number; aside?: React.ReactNode }) {
  return (
    <motion.section
      className="panel box"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 + delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="panel-head">
        <h2 className="label-sm">{title}</h2>
        {aside}
      </div>
      {children}
    </motion.section>
  )
}

export function BackLink() {
  return (
    <Link to="/" className="btn btn-quiet back-link">
      <ArrowLeft size={16} /> Notebook
    </Link>
  )
}

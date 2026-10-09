import { AnimatePresence, motion } from 'motion/react'
import { RefreshCw } from 'lucide-react'
import { useUpdateAvailable } from '../update'

/** A newer build of the app was published: offer a reload (never forced, nothing is lost). */
export function UpdateBanner() {
  const available = useUpdateAvailable()
  return (
    <AnimatePresence>
      {available && (
        <motion.div
          className="update-banner"
          role="status"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        >
          <span>A new version of Vocabook is ready.</span>
          <button className="btn btn-marker small" onClick={() => location.reload()}>
            <RefreshCw size={14} /> Reload
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

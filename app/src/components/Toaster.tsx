import { AnimatePresence, motion } from 'motion/react'
import { Check } from 'lucide-react'
import { useAppState } from '../app/state'

export function Toaster() {
  const { toasts, dismissToast } = useAppState()
  return (
    <div className="toaster" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className="toast"
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <Check size={15} strokeWidth={3} />
            <span>{t.message}</span>
            {t.action && (
              <button
                className="btn toast-action"
                onClick={() => {
                  t.action!.run()
                  dismissToast(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** What to show instead of the broken part. */
  fallback: ReactNode
  /** Changing this value (e.g. the route) clears the error and tries again. */
  resetKey?: unknown
}

/** Keeps a failure in one part of the page (often a third-party widget) from blanking the whole app. */
export class ErrorBoundary extends Component<Props, { failed: boolean; key: unknown }> {
  state = { failed: false, key: this.props.resetKey }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  static getDerivedStateFromProps(props: Props, state: { failed: boolean; key: unknown }) {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

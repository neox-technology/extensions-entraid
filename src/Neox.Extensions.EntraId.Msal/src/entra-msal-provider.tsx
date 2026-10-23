import { useEffect, useState, type ReactNode } from 'react'
import { MsalProvider } from '@azure/msal-react'
import type { PublicClientApplication } from '@azure/msal-browser'
import { getMsalInstance, isEntraConfigured } from './msal-config'

export function EntraMsalProvider({
  children,
  initErrorLabel,
  loadingLabel,
}: {
  children: ReactNode
  initErrorLabel: string
  loadingLabel: string
}) {
  const [instance, setInstance] = useState<PublicClientApplication | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isEntraConfigured()) {
      return
    }

    let cancelled = false

    void getMsalInstance()
      .then((pca) => {
        if (!cancelled) {
          setError(null)
          setInstance(pca)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : initErrorLabel)
        }
      })

    return () => {
      cancelled = true
    }
  }, [initErrorLabel])

  if (!isEntraConfigured()) {
    return children
  }

  if (error) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <p className="max-w-md text-center text-sm text-destructive">{error}</p>
      </div>
    )
  }

  if (!instance) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">{loadingLabel}</div>
    )
  }

  return <MsalProvider instance={instance}>{children}</MsalProvider>
}

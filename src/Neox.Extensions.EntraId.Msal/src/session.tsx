import { useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import {
  type AccountInfo,
  type AuthenticationResult,
  type IPublicClientApplication,
  type RedirectRequest,
  InteractionRequiredAuthError,
} from '@azure/msal-browser'
import { parseEntraConsentProblem, recoverEntraConsent } from './consent'
import { createApiSilentRequest, createLoginRequest } from './msal-config'

export const authLoginRedirectKey = 'auth-login-redirect'
export const refreshLeadMs = 5 * 60 * 1000
const stalledRefreshMs = 60_000

export type EntraSessionState =
  | { kind: 'ready'; result: AuthenticationResult }
  | { kind: 'redirect' }
  | { kind: 'sign-in' }

export type ApiTokenOutcome =
  | { kind: 'redirect' }
  | { kind: 'sign-in' }
  | { kind: 'token'; result: AuthenticationResult }

export function delayUntilTokenRefresh(expiresOn: Date | null, now = Date.now(), leadMs = refreshLeadMs): number | null {
  if (!expiresOn) {
    return null
  }

  return Math.max(0, expiresOn.getTime() - leadMs - now)
}

export async function redirectEntraLogin(
  instance: IPublicClientApplication,
  returnTo: string,
  request: RedirectRequest = createLoginRequest(),
): Promise<boolean> {
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(authLoginRedirectKey) === '1') {
    return false
  }

  sessionStorage.setItem(authLoginRedirectKey, '1')
  await instance.loginRedirect({ ...request, redirectStartPage: returnTo })
  return true
}

export async function requestApiToken(
  instance: IPublicClientApplication,
  account: AccountInfo | null | undefined,
  options?: { forceRefresh?: boolean; returnTo?: string },
): Promise<ApiTokenOutcome> {
  if (!account) {
    return { kind: 'sign-in' }
  }

  const returnTo = options?.returnTo ?? (typeof window === 'undefined' ? '/' : window.location.href)

  try {
    const result = await instance.acquireTokenSilent(createApiSilentRequest(account, options?.forceRefresh))

    sessionStorage.removeItem(authLoginRedirectKey)
    return { kind: 'token', result }
  } catch (err) {
    const problem = parseEntraConsentProblem(err)

    if (problem && problem.code !== 'interaction_required') {
      const recovery = await recoverEntraConsent(instance, {
        ...problem,
        scopes: problem.scopes.length > 0 ? problem.scopes : createApiSilentRequest(account, false).scopes,
      })

      if (recovery.kind === 'redirect') {
        return { kind: 'redirect' }
      }

      throw new Error(recovery.kind === 'denied' ? recovery.description : (recovery.adminConsentUrl ?? problem.description))
    }

    if (err instanceof InteractionRequiredAuthError || problem?.code === 'interaction_required') {
      await redirectEntraLogin(instance, returnTo)
      return { kind: 'redirect' }
    }

    throw err
  }
}

export async function ensureEntraSession(
  instance: IPublicClientApplication,
  account: AccountInfo | null | undefined,
  options?: { forceRefresh?: boolean; returnTo?: string },
): Promise<EntraSessionState> {
  const outcome = await requestApiToken(instance, account, options)

  if (outcome.kind === 'token') {
    return { kind: 'ready', result: outcome.result }
  }

  return outcome
}

export async function acquireApiAccessToken(
  instance: IPublicClientApplication,
  account: AccountInfo | null | undefined,
): Promise<AuthenticationResult> {
  const outcome = await requestApiToken(instance, account)

  if (outcome.kind === 'token') {
    return outcome.result
  }

  if (outcome.kind === 'sign-in') {
    throw new Error('No Entra account.')
  }

  return new Promise<AuthenticationResult>(() => {})
}

export function watchEntraSession(input: {
  acquire: (forceRefresh: boolean) => Promise<EntraSessionState>
  cancel: (id: number) => void
  documentRef: {
    addEventListener: (type: string, listener: () => void) => void
    removeEventListener: (type: string, listener: () => void) => void
    visibilityState: DocumentVisibilityState
  }
  now?: () => number
  onState: (state: EntraSessionState) => void
  schedule: (delay: number, cb: () => void) => number
}): () => void {
  let stopped = false
  let timer: number | undefined
  let lastExpiresAt: number | null = null

  const clearTimer = () => {
    if (timer !== undefined) {
      input.cancel(timer)
      timer = undefined
    }
  }

  const arm = (expiresOn: Date | null, unchanged: boolean) => {
    clearTimer()

    if (input.documentRef.visibilityState !== 'visible') {
      return
    }

    const delay = delayUntilTokenRefresh(expiresOn, input.now?.() ?? Date.now())

    if (delay === null) {
      return
    }

    const wait = delay === 0 && unchanged ? stalledRefreshMs : delay

    timer = input.schedule(wait, () => {
      void run(delay === 0)
    })
  }

  const run = async (forceRefresh: boolean) => {
    try {
      const state = await input.acquire(forceRefresh)

      if (stopped) {
        return
      }

      input.onState(state)

      if (state.kind === 'ready') {
        const next = state.result.expiresOn?.getTime() ?? null
        const unchanged = lastExpiresAt !== null && lastExpiresAt === next
        lastExpiresAt = next
        arm(state.result.expiresOn, unchanged)
        return
      }

      clearTimer()
    } catch {
      if (!stopped) {
        clearTimer()
      }
    }
  }

  const onVisibility = () => {
    if (input.documentRef.visibilityState === 'visible') {
      void run(false)
      return
    }

    clearTimer()
  }

  void run(false)
  input.documentRef.addEventListener('visibilitychange', onVisibility)

  return () => {
    stopped = true
    clearTimer()
    input.documentRef.removeEventListener('visibilitychange', onVisibility)
  }
}

export function useEntraSession(): EntraSessionState | { kind: 'loading' } {
  const { accounts, instance } = useMsal()
  const account = (instance.getActiveAccount() as AccountInfo | null) ?? accounts[0] ?? null
  const [state, setState] = useState<EntraSessionState | { kind: 'loading' }>({ kind: 'loading' })

  useEffect(() => {
    return watchEntraSession({
      acquire: (forceRefresh) =>
        ensureEntraSession(instance as IPublicClientApplication, account, {
          forceRefresh,
          returnTo: typeof window === 'undefined' ? '/' : window.location.href,
        }),
      cancel: (id) => window.clearTimeout(id),
      documentRef: document,
      onState: setState,
      schedule: (delay, cb) => window.setTimeout(cb, delay),
    })
  }, [account, instance])

  return state
}

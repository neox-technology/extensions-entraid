import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InteractionRequiredAuthError, type AccountInfo, type AuthenticationResult, type IPublicClientApplication } from '@azure/msal-browser'
import {
  authLoginRedirectKey,
  delayUntilTokenRefresh,
  ensureEntraSession,
  refreshLeadMs,
  watchEntraSession,
} from './session'

const account = {
  environment: 'login.microsoftonline.com',
  homeAccountId: 'home',
  localAccountId: 'local',
  tenantId: 'tenant',
  username: 'ada@example.com',
} as AccountInfo

function token(expiresOn: Date | null): AuthenticationResult {
  return { accessToken: 'token', expiresOn } as AuthenticationResult
}

function createInstance(): IPublicClientApplication & {
  acquireTokenRedirect: ReturnType<typeof vi.fn>
  acquireTokenSilent: ReturnType<typeof vi.fn>
  loginRedirect: ReturnType<typeof vi.fn>
} {
  return {
    acquireTokenRedirect: vi.fn(async () => {}),
    acquireTokenSilent: vi.fn(),
    loginRedirect: vi.fn(async () => {}),
  } as unknown as IPublicClientApplication & {
    acquireTokenRedirect: ReturnType<typeof vi.fn>
    acquireTokenSilent: ReturnType<typeof vi.fn>
    loginRedirect: ReturnType<typeof vi.fn>
  }
}

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  })
})

describe('ensureEntraSession', () => {
  it('signals sign-in when no account is cached', async () => {
    const instance = createInstance()

    await expect(ensureEntraSession(instance, null, { returnTo: '/admin' })).resolves.toEqual({ kind: 'sign-in' })
    expect(instance.loginRedirect).not.toHaveBeenCalled()
    expect(instance.acquireTokenSilent).not.toHaveBeenCalled()
  })

  it('returns the silent token and clears the redirect marker', async () => {
    const instance = createInstance()
    const result = token(new Date('2030-01-01T00:00:00Z'))
    store.set(authLoginRedirectKey, '1')
    instance.acquireTokenSilent.mockResolvedValue(result)

    await expect(ensureEntraSession(instance, account, { returnTo: '/admin' })).resolves.toEqual({
      kind: 'ready',
      result,
    })
    expect(store.has(authLoginRedirectKey)).toBe(false)
  })

  it('starts a single login redirect when interaction is required', async () => {
    const instance = createInstance()
    instance.acquireTokenSilent.mockRejectedValue(new InteractionRequiredAuthError('interaction_required', 'login'))

    await expect(ensureEntraSession(instance, account, { returnTo: '/admin/reports' })).resolves.toEqual({
      kind: 'redirect',
    })
    expect(store.get(authLoginRedirectKey)).toBe('1')
    expect(instance.loginRedirect).toHaveBeenCalledTimes(1)
    expect(instance.loginRedirect).toHaveBeenCalledWith(expect.objectContaining({ redirectStartPage: '/admin/reports' }))
    expect(instance.acquireTokenRedirect).not.toHaveBeenCalled()
  })

  it('does not start a second login redirect while the marker is set', async () => {
    const instance = createInstance()
    store.set(authLoginRedirectKey, '1')
    instance.acquireTokenSilent.mockRejectedValue(new InteractionRequiredAuthError('interaction_required', 'login'))

    await expect(ensureEntraSession(instance, account, { returnTo: '/admin' })).resolves.toEqual({ kind: 'redirect' })
    expect(instance.loginRedirect).not.toHaveBeenCalled()
  })

  it('keeps consent recovery on acquireTokenRedirect', async () => {
    const instance = createInstance()
    const error = new Error('consent') as Error & { errorCode?: string }
    error.errorCode = 'consent_required'
    instance.acquireTokenSilent.mockRejectedValue(error)

    await expect(ensureEntraSession(instance, account, { returnTo: '/admin' })).resolves.toEqual({ kind: 'redirect' })
    expect(instance.acquireTokenRedirect).toHaveBeenCalledTimes(1)
    expect(instance.loginRedirect).not.toHaveBeenCalled()
    expect(store.has(authLoginRedirectKey)).toBe(false)
  })
})

describe('delayUntilTokenRefresh', () => {
  it('waits until five minutes before expiry', () => {
    const now = 1_000_000

    expect(delayUntilTokenRefresh(new Date(now + 10 * 60 * 1000), now)).toBe(refreshLeadMs)
    expect(delayUntilTokenRefresh(new Date(now + 2 * 60 * 1000), now)).toBe(0)
    expect(delayUntilTokenRefresh(null, now)).toBeNull()
  })
})

describe('watchEntraSession', () => {
  it('checks on open, on visible, and arms a timer five minutes before expiry', async () => {
    const now = 1_000_000
    const expiresOn = new Date(now + 10 * 60 * 1000)
    const acquire = vi.fn(async () => ({ kind: 'ready' as const, result: token(expiresOn) }))
    const timers = new Map<number, { cb: () => void; delay: number }>()
    let nextId = 1
    const documentRef = {
      visibilityState: 'visible' as DocumentVisibilityState,
      listeners: new Set<() => void>(),
      addEventListener: (_type: string, listener: () => void) => {
        documentRef.listeners.add(listener)
      },
      removeEventListener: (_type: string, listener: () => void) => {
        documentRef.listeners.delete(listener)
      },
      emit() {
        for (const listener of documentRef.listeners) {
          listener()
        }
      },
    }
    const cancelled: number[] = []

    const stop = watchEntraSession({
      acquire,
      cancel: (id) => {
        cancelled.push(id)
        timers.delete(id)
      },
      documentRef,
      now: () => now,
      onState: () => {},
      schedule: (delay, cb) => {
        const id = nextId
        nextId += 1
        timers.set(id, { cb, delay })
        return id
      },
    })

    await vi.waitFor(() => expect(acquire).toHaveBeenCalledTimes(1))
    expect(acquire).toHaveBeenCalledWith(false)
    expect([...timers.values()][0]?.delay).toBe(refreshLeadMs)

    documentRef.visibilityState = 'hidden'
    documentRef.emit()
    expect(cancelled).toHaveLength(1)
    expect(timers.size).toBe(0)

    documentRef.visibilityState = 'visible'
    documentRef.emit()
    await vi.waitFor(() => expect(acquire).toHaveBeenCalledTimes(2))
    expect([...timers.values()][0]?.delay).toBe(refreshLeadMs)

    stop()
  })

  it('force-refreshes when the token is already inside the lead window', async () => {
    const now = 1_000_000
    const expiresOn = new Date(now + 2 * 60 * 1000)
    const acquire = vi.fn(async (forceRefresh: boolean) => ({ kind: 'ready' as const, result: token(expiresOn) }))
    let scheduled: { cb: () => void; delay: number } | undefined

    watchEntraSession({
      acquire,
      cancel: () => {},
      documentRef: {
        addEventListener: () => {},
        removeEventListener: () => {},
        visibilityState: 'visible',
      },
      now: () => now,
      onState: () => {},
      schedule: (delay, cb) => {
        scheduled = { cb, delay }
        return 1
      },
    })

    await vi.waitFor(() => expect(scheduled?.delay).toBe(0))
    scheduled?.cb()
    await vi.waitFor(() => expect(acquire).toHaveBeenCalledWith(true))
  })
})

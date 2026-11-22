import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountInfo, AuthenticationResult, IPublicClientApplication } from '@azure/msal-browser'
import { ApiError, parseApiErrorMessage, performAdminFetch } from './api-client'

const account = {
  environment: 'login.microsoftonline.com',
  homeAccountId: 'home',
  localAccountId: 'local',
  tenantId: 'tenant',
  username: 'ada@example.com',
} as AccountInfo

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

function createInstance(): IPublicClientApplication & {
  acquireTokenRedirect: ReturnType<typeof vi.fn>
  acquireTokenSilent: ReturnType<typeof vi.fn>
  loginRedirect: ReturnType<typeof vi.fn>
} {
  const instance = {
    acquireTokenRedirect: vi.fn(async () => {}),
    acquireTokenSilent: vi.fn(async (request: { forceRefresh?: boolean }) =>
      ({
        accessToken: request.forceRefresh ? 'refreshed' : 'first',
        expiresOn: new Date('2030-01-01T00:00:00Z'),
      }) as AuthenticationResult,
    ),
    loginRedirect: vi.fn(async () => {}),
  }

  return instance as unknown as IPublicClientApplication & {
    acquireTokenRedirect: ReturnType<typeof vi.fn>
    acquireTokenSilent: ReturnType<typeof vi.fn>
    loginRedirect: ReturnType<typeof vi.fn>
  }
}

function jsonResponse(status: number, body: string) {
  return new Response(body, { status })
}

describe('performAdminFetch', () => {
  it('retries a non-consent 401 once after a forced refresh', async () => {
    const instance = createInstance()
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get('Authorization')

      if (authorization === 'Bearer refreshed') {
        return jsonResponse(200, 'ok')
      }

      return jsonResponse(401, 'expired')
    })

    const response = await performAdminFetch({
      account,
      baseUrl: 'https://api.example',
      fetchImpl: fetchImpl as typeof fetch,
      instance,
      path: '/items',
    })

    expect(response.status).toBe(200)
    expect(instance.acquireTokenSilent).toHaveBeenCalledTimes(2)
    expect(instance.acquireTokenSilent).toHaveBeenLastCalledWith(expect.objectContaining({ forceRefresh: true }))
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(instance.loginRedirect).not.toHaveBeenCalled()
  })

  it('redirects once when the replayed call is still unauthorized', async () => {
    const instance = createInstance()
    const fetchImpl = vi.fn(async () => jsonResponse(401, 'still expired'))

    const pending = performAdminFetch({
      account,
      baseUrl: 'https://api.example',
      fetchImpl: fetchImpl as typeof fetch,
      instance,
      path: '/items',
    })

    await vi.waitFor(() => expect(instance.loginRedirect).toHaveBeenCalledTimes(1))
    expect(instance.acquireTokenSilent).toHaveBeenCalledTimes(2)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(instance.loginRedirect).toHaveBeenCalledWith(expect.objectContaining({ redirectStartPage: window.location.href }))
    void pending
  })

  it('keeps consent recovery and does not force a refresh', async () => {
    const instance = createInstance()
    const fetchImpl = vi.fn(async () =>
      jsonResponse(401, JSON.stringify({ code: 'consent_required', scopes: ['api://app/access'] })),
    )

    const pending = performAdminFetch({
      account,
      baseUrl: 'https://api.example',
      fetchImpl: fetchImpl as typeof fetch,
      instance,
      path: '/items',
    })

    await vi.waitFor(() => expect(instance.acquireTokenRedirect).toHaveBeenCalledTimes(1))
    expect(instance.acquireTokenSilent).toHaveBeenCalledTimes(1)
    expect(instance.acquireTokenSilent).not.toHaveBeenCalledWith(expect.objectContaining({ forceRefresh: true }))
    expect(instance.loginRedirect).not.toHaveBeenCalled()
    expect(instance.acquireTokenRedirect).toHaveBeenCalledWith({ prompt: 'consent', scopes: ['api://app/access'] })
    void pending
  })

  it('reports access denied on 403 without reconnecting', async () => {
    const instance = createInstance()
    const fetchImpl = vi.fn(async () => jsonResponse(403, JSON.stringify({ description: 'nope' })))

    await expect(
      performAdminFetch({
        account,
        baseUrl: 'https://api.example',
        fetchImpl: fetchImpl as typeof fetch,
        instance,
        path: '/items',
      }),
    ).rejects.toEqual(expect.objectContaining({ message: 'Accès refusé', status: 403 }))
    expect(instance.loginRedirect).not.toHaveBeenCalled()
    expect(instance.acquireTokenSilent).toHaveBeenCalledTimes(1)
    expect(instance.acquireTokenSilent).not.toHaveBeenCalledWith(expect.objectContaining({ forceRefresh: true }))
  })
})

describe('parseApiErrorMessage', () => {
  it('returns the access denied label for a 403 even when the body has a description', () => {
    const error = new ApiError('Accès refusé', 403, JSON.stringify({ description: 'detail' }))

    expect(parseApiErrorMessage(error, 'fallback')).toBe('Accès refusé')
  })
})

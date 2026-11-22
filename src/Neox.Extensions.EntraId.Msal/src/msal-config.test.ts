import { beforeEach, describe, expect, it, vi } from 'vitest'

const clients = vi.hoisted(() => ({
  created: [] as Array<{
    acquireTokenRedirect: ReturnType<typeof vi.fn>
    handleRedirectPromise: ReturnType<typeof vi.fn>
  }>,
  denied: null as Error | null,
}))

vi.mock('@azure/msal-browser', async () => {
  const actual = await vi.importActual<typeof import('@azure/msal-browser')>('@azure/msal-browser')

  return {
    ...actual,
    PublicClientApplication: class {
      acquireTokenRedirect = vi.fn(async () => {})
      getActiveAccount = vi.fn(() => null)
      getAllAccounts = vi.fn(() => [])
      handleRedirectPromise = vi.fn(async () => {
        if (clients.denied) {
          throw clients.denied
        }

        return null
      })
      initialize = vi.fn(async () => {})
      setActiveAccount = vi.fn()

      constructor() {
        clients.created.push(this)
      }
    },
  }
})

async function loadConfig() {
  return import('./msal-config')
}

beforeEach(() => {
  clients.created.length = 0
  clients.denied = null
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.stubEnv('VITE_ENTRA_CLIENT_ID', 'client-id')
  vi.stubEnv('VITE_ENTRA_TENANT_ID', 'tenant-id')
  vi.stubEnv('VITE_ENTRA_REDIRECT_URI', 'https://spa.example/callback')
  vi.stubEnv('VITE_ENTRA_API_SCOPE', 'api://app/access_as_user')
})

describe('msal config from the environment', () => {
  it('builds the authority, login request and silent request', async () => {
    const { createApiSilentRequest, createLoginRequest, createMsalConfig, isEntraConfigured } = await loadConfig()
    const account = { homeAccountId: 'home' } as never

    expect(isEntraConfigured()).toBe(true)
    expect(createMsalConfig().auth).toMatchObject({
      authority: 'https://login.microsoftonline.com/tenant-id',
      clientId: 'client-id',
      redirectUri: 'https://spa.example/callback',
    })
    expect(createLoginRequest().scopes).toEqual(['openid', 'profile', 'offline_access', 'api://app/access_as_user'])
    expect(createApiSilentRequest(account, true)).toEqual({
      account,
      forceRefresh: true,
      scopes: ['api://app/access_as_user'],
    })
  })

  it('prefers indexed scopes over the single scope', async () => {
    vi.stubEnv('VITE_ENTRA_Scopes__0', 'api://app/one')
    vi.stubEnv('VITE_ENTRA_Scopes__1', 'api://app/two')
    const { createApiSilentRequest } = await loadConfig()

    expect(createApiSilentRequest(undefined, false).scopes).toEqual(['api://app/one', 'api://app/two'])
  })

  it('throws when the client id or tenant is missing', async () => {
    vi.stubEnv('VITE_ENTRA_CLIENT_ID', '')
    const { createMsalConfig, isEntraConfigured } = await loadConfig()

    expect(isEntraConfigured()).toBe(false)
    expect(() => createMsalConfig()).toThrow(/VITE_ENTRA_CLIENT_ID/)
  })

  it('exposes a denied redirect error without a second redirect', async () => {
    const denied = Object.assign(new Error('cancelled'), { errorCode: 'consent_denied' })
    clients.denied = denied
    const { getMsalInstance } = await loadConfig()

    await expect(getMsalInstance()).rejects.toThrow('cancelled')
    const client = clients.created[0]
    expect(client.acquireTokenRedirect).not.toHaveBeenCalled()
  })
})

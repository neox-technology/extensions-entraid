import {
  type AccountInfo,
  type Configuration,
  type RedirectRequest,
  type SilentRequest,
  LogLevel,
  PublicClientApplication,
} from '@azure/msal-browser'
import { parseEntraConsentProblem, recoverEntraConsent } from './consent'
import { readEnvValue, readIndexedEnv } from './env'

type EntraEnv = {
  apiScopes: string[]
  clientId?: string
  redirectUri?: string
  tenantId?: string
}

function readViteEntraEnv(): EntraEnv {
  const indexed = readIndexedEnv('VITE_ENTRA_Scopes__')
  const single = readEnvValue('VITE_ENTRA_API_SCOPE', 'VITE_ENTRA_Scope')

  return {
    clientId: readEnvValue('VITE_ENTRA_CLIENT_ID', 'VITE_ENTRA_ClientId'),
    tenantId: readEnvValue('VITE_ENTRA_TENANT_ID', 'VITE_ENTRA_TenantId'),
    redirectUri: readEnvValue('VITE_ENTRA_REDIRECT_URI'),
    apiScopes: indexed.length > 0 ? indexed : single ? [single] : [],
  }
}

export function isEntraConfigured(env: EntraEnv = readViteEntraEnv()) {
  return Boolean(env.clientId && env.tenantId)
}

export function createApiSilentRequest(
  account: AccountInfo | undefined,
  forceRefresh: boolean | undefined,
  env: EntraEnv = readViteEntraEnv(),
): SilentRequest {
  return {
    account,
    forceRefresh,
    scopes: env.apiScopes,
  }
}

export function createLoginRequest(env: EntraEnv = readViteEntraEnv()): RedirectRequest {
  return {
    scopes: ['openid', 'profile', 'offline_access', ...env.apiScopes],
  }
}

export function createMsalConfig(env: EntraEnv = readViteEntraEnv()): Configuration {
  const clientId = env.clientId
  const tenantId = env.tenantId

  if (!clientId || !tenantId) {
    throw new Error('Missing VITE_ENTRA_CLIENT_ID / VITE_ENTRA_TENANT_ID.')
  }

  const redirectUri = env.redirectUri || window.location.origin

  return {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri,
      postLogoutRedirectUri: redirectUri,
    },
    cache: {
      cacheLocation: 'localStorage',
    },
    system: {
      loggerOptions: {
        logLevel: LogLevel.Warning,
      },
    },
  }
}

let msalInstance: PublicClientApplication | null = null
let msalInitPromise: Promise<PublicClientApplication> | null = null

export async function getMsalInstance(): Promise<PublicClientApplication> {
  if (msalInstance) {
    return msalInstance
  }

  if (!msalInitPromise) {
    msalInitPromise = (async () => {
      const pca = new PublicClientApplication(createMsalConfig())
      await pca.initialize()

      try {
        const result = await pca.handleRedirectPromise()
        const account = result?.account ?? pca.getActiveAccount() ?? pca.getAllAccounts()[0]

        if (account) {
          pca.setActiveAccount(account)
        }
      } catch (err) {
        const problem = parseEntraConsentProblem(err)

        if (!problem) {
          throw err
        }

        const recovery = await recoverEntraConsent(pca, problem)

        if (recovery.kind === 'redirect') {
          return new Promise<PublicClientApplication>(() => {})
        }

        throw new Error(recovery.kind === 'denied' ? recovery.description : (recovery.adminConsentUrl ?? problem.description))
      }

      msalInstance = pca
      return pca
    })().catch((err: unknown) => {
      msalInitPromise = null
      throw err
    })
  }

  return msalInitPromise
}

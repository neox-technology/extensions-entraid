import {
  type AccountInfo,
  type AuthenticationResult,
  type Configuration,
  type IPublicClientApplication,
  type RedirectRequest,
  type SilentRequest,
  InteractionRequiredAuthError,
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

export async function acquireApiAccessToken(
  instance: IPublicClientApplication,
  account: AccountInfo | null | undefined,
  env: EntraEnv = readViteEntraEnv(),
): Promise<AuthenticationResult> {
  const request: SilentRequest = {
    account: account ?? undefined,
    scopes: env.apiScopes,
  }

  try {
    return await instance.acquireTokenSilent(request)
  } catch (err) {
    const problem = parseEntraConsentProblem(err)

    if (problem) {
      const recovery = await recoverEntraConsent(instance, {
        ...problem,
        scopes: problem.scopes.length > 0 ? problem.scopes : env.apiScopes,
      })

      if (recovery.kind === 'redirect') {
        return new Promise<AuthenticationResult>(() => {})
      }

      throw new Error(recovery.kind === 'denied' ? recovery.description : (recovery.adminConsentUrl ?? problem.description))
    }

    if (err instanceof InteractionRequiredAuthError) {
      await instance.acquireTokenRedirect(request)
      return new Promise<AuthenticationResult>(() => {})
    }

    throw err
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

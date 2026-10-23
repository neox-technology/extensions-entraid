export type EntraConsentCode =
  | 'admin_consent_required'
  | 'claims_challenge'
  | 'consent_denied'
  | 'consent_required'
  | 'interaction_required'

export type EntraConsentProblem = {
  adminConsentUrl?: string | null
  claims?: string | null
  code: EntraConsentCode
  description: string
  scopes: string[]
}

export type EntraConsentRecovery =
  | { adminConsentUrl?: string | null; kind: 'admin' }
  | { description: string; kind: 'denied' }
  | { kind: 'redirect' }

const codes: readonly EntraConsentCode[] = [
  'admin_consent_required',
  'claims_challenge',
  'consent_denied',
  'consent_required',
  'interaction_required',
]

export function parseEntraConsentProblem(error: unknown): EntraConsentProblem | undefined {
  const payload = readPayload(error)

  if (!payload) {
    return undefined
  }

  const text = `${payload.code ?? ''} ${payload.description ?? ''} ${payload.message ?? ''}`

  if (payload.code && codes.includes(payload.code as EntraConsentCode)) {
    return {
      adminConsentUrl: payload.adminConsentUrl,
      claims: payload.claims,
      code: payload.code as EntraConsentCode,
      description: payload.description ?? payload.message ?? payload.code,
      scopes: payload.scopes ?? [],
    }
  }

  if (text.includes('AADSTS65004') || text.includes('access_denied')) {
    return { code: 'consent_denied', description: payload.message ?? text, scopes: payload.scopes ?? [] }
  }

  if (text.includes('AADSTS65001') || text.includes('AADSTS90094')) {
    return { code: 'admin_consent_required', description: payload.message ?? text, scopes: payload.scopes ?? [] }
  }

  if (payload.claims) {
    return {
      claims: payload.claims,
      code: 'claims_challenge',
      description: payload.message ?? text,
      scopes: payload.scopes ?? [],
    }
  }

  if (text.includes('consent_required')) {
    return { code: 'consent_required', description: payload.message ?? text, scopes: payload.scopes ?? [] }
  }

  if (text.includes('login_required') || text.includes('interaction_required')) {
    return { code: 'interaction_required', description: payload.message ?? text, scopes: payload.scopes ?? [] }
  }

  return undefined
}

export async function recoverEntraConsent(
  instance: { acquireTokenRedirect: (request: { claims?: string; prompt?: string; scopes: string[] }) => Promise<void> },
  problem: EntraConsentProblem,
): Promise<EntraConsentRecovery> {
  switch (problem.code) {
    case 'consent_required':
      await instance.acquireTokenRedirect({ scopes: problem.scopes, prompt: 'consent' })
      return { kind: 'redirect' }
    case 'claims_challenge':
      await instance.acquireTokenRedirect({ scopes: problem.scopes, claims: problem.claims ?? undefined })
      return { kind: 'redirect' }
    case 'interaction_required':
      await instance.acquireTokenRedirect({ scopes: problem.scopes })
      return { kind: 'redirect' }
    case 'admin_consent_required':
      return { kind: 'admin', adminConsentUrl: problem.adminConsentUrl }
    case 'consent_denied':
      return { kind: 'denied', description: problem.description }
  }
}

function readPayload(error: unknown): {
  adminConsentUrl?: string | null
  claims?: string | null
  code?: string
  description?: string
  message?: string
  scopes?: string[]
} | undefined {
  if (typeof error === 'string') {
    return parseJson(error) ?? { message: error }
  }

  if (error instanceof Error) {
    const withClaims = error as Error & { claims?: string; errorCode?: string }
    return {
      claims: withClaims.claims,
      code: withClaims.errorCode,
      message: error.message,
    }
  }

  if (error && typeof error === 'object') {
    return error as { code?: string; description?: string; message?: string; scopes?: string[] }
  }

  return undefined
}

function parseJson(value: string): { code?: string; description?: string; message?: string; scopes?: string[] } | undefined {
  try {
    return JSON.parse(value) as { code?: string; description?: string; message?: string; scopes?: string[] }
  } catch {
    return undefined
  }
}

import { describe, expect, it, vi } from 'vitest'
import { parseEntraConsentProblem, recoverEntraConsent, type EntraConsentProblem } from './consent'

function instance() {
  return { acquireTokenRedirect: vi.fn(async () => {}) }
}

function problem(partial: Partial<EntraConsentProblem> & Pick<EntraConsentProblem, 'code'>): EntraConsentProblem {
  return {
    description: partial.description ?? partial.code,
    scopes: partial.scopes ?? ['api://app/access'],
    ...partial,
  }
}

describe('recoverEntraConsent', () => {
  it('redirects with prompt consent for consent_required', async () => {
    const pca = instance()

    await expect(recoverEntraConsent(pca, problem({ code: 'consent_required' }))).resolves.toEqual({ kind: 'redirect' })
    expect(pca.acquireTokenRedirect).toHaveBeenCalledWith({ prompt: 'consent', scopes: ['api://app/access'] })
  })

  it('passes claims through and omits them when they are absent', async () => {
    const withClaims = instance()
    const withoutClaims = instance()

    await recoverEntraConsent(withClaims, problem({ claims: 'raw-claims', code: 'claims_challenge' }))
    await recoverEntraConsent(withoutClaims, problem({ code: 'claims_challenge' }))

    expect(withClaims.acquireTokenRedirect).toHaveBeenCalledWith({ claims: 'raw-claims', scopes: ['api://app/access'] })
    expect(withoutClaims.acquireTokenRedirect).toHaveBeenCalledWith({ claims: undefined, scopes: ['api://app/access'] })
  })

  it('redirects without prompt for interaction_required', async () => {
    const pca = instance()

    await expect(recoverEntraConsent(pca, problem({ code: 'interaction_required' }))).resolves.toEqual({ kind: 'redirect' })
    expect(pca.acquireTokenRedirect).toHaveBeenCalledWith({ scopes: ['api://app/access'] })
  })

  it('returns the admin consent url without a redirect', async () => {
    const pca = instance()

    await expect(
      recoverEntraConsent(pca, problem({ adminConsentUrl: 'https://login.example/admin', code: 'admin_consent_required' })),
    ).resolves.toEqual({ adminConsentUrl: 'https://login.example/admin', kind: 'admin' })
    expect(pca.acquireTokenRedirect).not.toHaveBeenCalled()
  })

  it('does not retry a denied consent', async () => {
    const pca = instance()

    await expect(
      recoverEntraConsent(pca, problem({ code: 'consent_denied', description: 'cancelled' })),
    ).resolves.toEqual({ description: 'cancelled', kind: 'denied' })
    expect(pca.acquireTokenRedirect).not.toHaveBeenCalled()
  })
})

describe('parseEntraConsentProblem', () => {
  it('reads a stable json body', () => {
    const parsed = parseEntraConsentProblem(
      JSON.stringify({
        claims: 'raw',
        code: 'claims_challenge',
        description: 'need claims',
        scopes: ['api://app/access'],
      }),
    )

    expect(parsed).toEqual({
      claims: 'raw',
      code: 'claims_challenge',
      description: 'need claims',
      scopes: ['api://app/access'],
    })
  })

  it('maps aadsts and login markers', () => {
    expect(parseEntraConsentProblem('AADSTS65004')?.code).toBe('consent_denied')
    expect(parseEntraConsentProblem('AADSTS90094')?.code).toBe('admin_consent_required')
    expect(parseEntraConsentProblem('AADSTS65001')?.code).toBe('admin_consent_required')
    expect(parseEntraConsentProblem({ claims: 'raw', message: 'more' })?.code).toBe('claims_challenge')
    expect(parseEntraConsentProblem('login_required')?.code).toBe('interaction_required')
  })
})

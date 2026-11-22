import { useCallback } from 'react'
import { useMsal } from '@azure/msal-react'
import type { AccountInfo, IPublicClientApplication } from '@azure/msal-browser'
import { parseEntraConsentProblem, recoverEntraConsent } from './consent'
import { readEnvValue } from './env'
import { redirectEntraLogin, requestApiToken } from './session'

export class ApiError extends Error {
  readonly body?: string
  readonly status: number

  constructor(message: string, status: number, body?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export function parseApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status === 403) {
    return 'Accès refusé'
  }

  if (error instanceof ApiError && error.body) {
    try {
      const payload = JSON.parse(error.body) as { description?: string; message?: string }

      if (payload.description) {
        return payload.description
      }

      if (payload.message) {
        return payload.message
      }
    } catch {
      return error.body
    }
  }

  return error instanceof Error ? error.message : fallback
}

const maxPageSize = 100

type PagedPayload<T> = {
  items: T[]
  totalCount: number
}

export async function fetchAllPages<T>(
  adminFetch: (path: string, init?: RequestInit) => Promise<Response>,
  path: string,
): Promise<T[]> {
  const items: T[] = []
  let page = 1
  let totalCount = 0

  do {
    const separator = path.includes('?') ? '&' : '?'
    const response = await adminFetch(`${path}${separator}page=${page}&pageSize=${maxPageSize}`)
    const payload = (await response.json()) as PagedPayload<T>
    items.push(...payload.items)
    totalCount = payload.totalCount

    if (payload.items.length === 0) {
      break
    }

    page += 1
  } while (items.length < totalCount)

  return items
}

export async function performAdminFetch(input: {
  account: AccountInfo | null | undefined
  baseUrl: string
  fetchImpl?: typeof fetch
  init?: RequestInit
  instance: IPublicClientApplication
  path: string
}): Promise<Response> {
  const fetchImpl = input.fetchImpl ?? fetch
  const base = input.baseUrl.replace(/\/$/, '')
  const url = input.path.startsWith('http')
    ? input.path
    : `${base}${input.path.startsWith('/') ? '' : '/'}${input.path}`
  const returnTo = typeof window === 'undefined' ? '/' : window.location.href

  const send = async (accessToken: string) => {
    const headers = new Headers(input.init?.headers)
    headers.set('Authorization', `Bearer ${accessToken}`)

    if (input.init?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    return fetchImpl(url, { ...input.init, headers })
  }

  const first = await requestApiToken(input.instance, input.account, { returnTo })

  if (first.kind === 'sign-in') {
    throw new Error('No Entra account.')
  }

  if (first.kind !== 'token') {
    return new Promise<Response>(() => {})
  }

  let response = await send(first.result.accessToken)

  if (response.status === 401) {
    const body = await response.text().catch(() => '')
    const problem = parseEntraConsentProblem(body)

    if (problem) {
      const recovery = await recoverEntraConsent(input.instance, problem)

      if (recovery.kind === 'redirect') {
        return new Promise<Response>(() => {})
      }

      const message = recovery.kind === 'denied' ? recovery.description : (recovery.adminConsentUrl ?? problem.description)
      throw new ApiError(message, 401, body)
    }

    const refreshed = await requestApiToken(input.instance, input.account, {
      forceRefresh: true,
      returnTo,
    })

    if (refreshed.kind === 'sign-in') {
      throw new Error('No Entra account.')
    }

    if (refreshed.kind !== 'token') {
      return new Promise<Response>(() => {})
    }

    response = await send(refreshed.result.accessToken)

    if (response.status === 401) {
      const replayBody = await response.text().catch(() => '')
      const started = await redirectEntraLogin(input.instance, returnTo)

      if (started) {
        return new Promise<Response>(() => {})
      }

      throw new ApiError(`API 401 for ${input.path}`, 401, replayBody)
    }
  }

  if (response.status === 403) {
    const body = await response.text().catch(() => undefined)
    throw new ApiError('Accès refusé', 403, body)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => undefined)
    throw new ApiError(`API ${response.status} for ${input.path}`, response.status, body)
  }

  return response
}

export function useAdminApi({ baseUrlEnvName }: { baseUrlEnvName: string }) {
  const { accounts, instance } = useMsal()

  const adminFetch = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const account = (instance.getActiveAccount() as AccountInfo | null) ?? accounts[0]
      const base = readEnvValue(baseUrlEnvName)

      if (!base) {
        throw new Error(`Missing ${baseUrlEnvName}.`)
      }

      return performAdminFetch({
        account,
        baseUrl: base,
        init,
        instance: instance as IPublicClientApplication,
        path,
      })
    },
    [accounts, baseUrlEnvName, instance],
  )

  return { adminFetch }
}

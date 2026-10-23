import { useCallback } from 'react'
import { useMsal } from '@azure/msal-react'
import type { AccountInfo, IPublicClientApplication } from '@azure/msal-browser'
import { parseEntraConsentProblem, recoverEntraConsent } from './consent'
import { readEnvValue } from './env'
import { acquireApiAccessToken } from './msal-config'

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

export function useAdminApi({ baseUrlEnvName }: { baseUrlEnvName: string }) {
  const { instance, accounts } = useMsal()

  const adminFetch = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const account = (instance.getActiveAccount() as AccountInfo | null) ?? accounts[0]
      const result = await acquireApiAccessToken(instance as IPublicClientApplication, account)
      const headers = new Headers(init.headers)
      headers.set('Authorization', `Bearer ${result.accessToken}`)

      if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
      }

      const base = readEnvValue(baseUrlEnvName)

      if (!base) {
        throw new Error(`Missing ${baseUrlEnvName}.`)
      }

      const url = path.startsWith('http') ? path : `${base.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`
      const response = await fetch(url, { ...init, headers })

      if (response.status === 401) {
        const body = await response.text().catch(() => '')
        const problem = parseEntraConsentProblem(body)

        if (problem) {
          const recovery = await recoverEntraConsent(instance as IPublicClientApplication, problem)

          if (recovery.kind === 'redirect') {
            return new Promise<Response>(() => {})
          }

          const message = recovery.kind === 'denied' ? recovery.description : (recovery.adminConsentUrl ?? problem.description)
          throw new ApiError(message, 401, body)
        }

        throw new ApiError(`API 401 for ${path}`, 401, body)
      }

      if (!response.ok) {
        const body = await response.text().catch(() => undefined)
        throw new ApiError(`API ${response.status} for ${path}`, response.status, body)
      }

      return response
    },
    [accounts, baseUrlEnvName, instance],
  )

  return { adminFetch }
}

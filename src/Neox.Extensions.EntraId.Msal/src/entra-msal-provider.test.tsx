import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EntraMsalProvider } from './entra-msal-provider'

const config = vi.hoisted(() => ({
  configured: false,
  getMsalInstance: vi.fn(),
}))

vi.mock('./msal-config', async () => {
  const actual = await vi.importActual<typeof import('./msal-config')>('./msal-config')

  return {
    ...actual,
    getMsalInstance: config.getMsalInstance,
    isEntraConfigured: () => config.configured,
  }
})

vi.mock('@azure/msal-react', () => ({
  MsalProvider: ({ children }: { children: ReactNode }) => <div data-testid="msal">{children}</div>,
}))

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  config.configured = false
  config.getMsalInstance.mockReset()
})

describe('EntraMsalProvider', () => {
  it('renders children when entra is not configured', () => {
    render(
      <EntraMsalProvider initErrorLabel="init" loadingLabel="loading">
        <p>ready</p>
      </EntraMsalProvider>,
    )

    expect(screen.getByText('ready')).toBeTruthy()
    expect(config.getMsalInstance).not.toHaveBeenCalled()
  })

  it('renders children inside the provider when the instance resolves', async () => {
    config.configured = true
    config.getMsalInstance.mockResolvedValue({})

    render(
      <EntraMsalProvider initErrorLabel="init" loadingLabel="loading">
        <p>ready</p>
      </EntraMsalProvider>,
    )

    const provider = await screen.findByTestId('msal')

    expect(provider.textContent).toBe('ready')
  })
})

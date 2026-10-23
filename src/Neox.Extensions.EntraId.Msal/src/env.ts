type EnvBag = Record<string, string | undefined>

function runtimeEnv(): EnvBag {
  if (typeof window === 'undefined') {
    return {}
  }

  const env = (window as Window & { __ENV__?: EnvBag }).__ENV__

  return env ?? {}
}

export function readEnvValue(...keys: string[]): string | undefined {
  const runtime = runtimeEnv()

  for (const key of keys) {
    const fromRuntime = runtime[key]?.trim()

    if (fromRuntime) {
      return fromRuntime
    }

    const fromVite = import.meta.env[key]

    if (typeof fromVite === 'string' && fromVite.trim()) {
      return fromVite.trim()
    }
  }

  return undefined
}

export function readIndexedEnv(prefix: string): string[] {
  const values = new Map<number, string>()
  const sources: EnvBag[] = [runtimeEnv(), import.meta.env as EnvBag]

  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (!key.startsWith(prefix) || typeof value !== 'string' || !value.trim()) {
        continue
      }

      const index = Number(key.slice(prefix.length))

      if (Number.isInteger(index)) {
        values.set(index, value.trim())
      }
    }
  }

  return [...values.entries()].sort((left, right) => left[0] - right[0]).map(([, value]) => value)
}

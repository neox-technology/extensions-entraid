import { useState } from 'react'
import { EntraMsalProvider, useAdminApi, useEntraSession } from '@neox-technology/extensions-entraid-msal'

const probes = [
  ['/graph/me', 'Consentement utilisateur'],
  ['/graph/directory', 'Consentement administrateur'],
  ['/probe/claims', 'Claims challenge'],
  ['/probe/unauthorized', '401'],
  ['/probe/forbidden', '403'],
] as const

export default function App() {
  return (
    <EntraMsalProvider initErrorLabel="Connexion Entra impossible." loadingLabel="Connexion…">
      <Manuals />
    </EntraMsalProvider>
  )
}

function Manuals() {
  const session = useEntraSession()
  const { adminFetch } = useAdminApi({ baseUrlEnvName: 'VITE_API_BASE_URL' })
  const [status, setStatus] = useState('Aucun appel.')

  async function call(path: string) {
    setStatus(`${path}…`)

    try {
      const response = await adminFetch(path)
      const body = await response.text()
      setStatus(`${response.status} ${body}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Erreur')
    }
  }

  return (
    <main>
      <h1>Entra manuals</h1>
      <p>Session : {session.kind}</p>
      <ul>
        {probes.map(([path, label]) => (
          <li key={path}>
            <button type="button" onClick={() => void call(path)}>
              {label}
            </button>
          </li>
        ))}
      </ul>
      <pre>{status}</pre>
    </main>
  )
}

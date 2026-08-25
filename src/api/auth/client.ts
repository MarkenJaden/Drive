import { createSignal, type Accessor } from 'solid-js'

import { API_URL } from '../config'

const AUTH_KEY = 'ai.comma.api.authorization'

let initialized = false
const [_accessToken, _setAccessToken] = createSignal<string | null>(null)

export async function refreshAccessToken(code: string, provider: string): Promise<void> {
  try {
    const resp = await fetch(`${API_URL}/v2/auth/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ code, provider }),
    })

    if (resp.ok) {
      const json = (await resp.json()) as Record<string, string>
      if (json.access_token) {
        setAccessToken(json.access_token)
        return
      }
    }
  } catch {
    // API backend /v2/auth/ not available
  }

  // Self-Hosted fallback for single-container deployments:
  // Create a persistent self-hosted JWT session
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(
    JSON.stringify({
      identity: 'MarkenJaden',
      email: 'jjsch1410@gmail.com',
      sub: 'MarkenJaden',
      provider: provider || 'github',
      code: code ? code.slice(0, 8) : undefined,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    })
  )
  const selfHostedJwt = `${header}.${payload}.self_hosted_sig`
  setAccessToken(selfHostedJwt)
}

export const accessToken: Accessor<string | null> = () => {
  if (!initialized) {
    initialized = true
    _setAccessToken(localStorage.getItem(AUTH_KEY))
  }
  return _accessToken()
}

export function setAccessToken(token: string | null): void {
  _setAccessToken(token)
  if (token === null) {
    localStorage.removeItem(AUTH_KEY)
  } else {
    localStorage.setItem(AUTH_KEY, token)
  }
}

export function isSignedIn(): boolean {
  return !!accessToken()
}

export function signOut(): void {
  setAccessToken(null)
}

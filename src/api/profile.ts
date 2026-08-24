import type { Profile } from '~/api/types'
import { fetcher } from '.'
import { accessToken } from './auth/client'

function decodeJwtPayload(token: string | null): Record<string, any> | null {
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const jsonStr = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(jsonStr)
  } catch {
    return null
  }
}

export const getProfile = async (): Promise<Profile> => {
  const token = accessToken()
  if (!token) {
    return { id: 'anon', email: 'Nicht angemeldet', superuser: false } as Profile
  }

  // 1. Try standard backend API /v1/me/
  try {
    const data = await fetcher<Profile>('/v1/me/')
    if (data && data.email && typeof data.email === 'string' && data.email.includes('@')) {
      return data
    }
  } catch {
    // API backend endpoint /v1/me/ not available yet on self-hosted
  }

  // 2. If token is a GitHub token, fetch user profile directly from GitHub
  if (token.startsWith('gho_') || token.startsWith('ghu_') || token.startsWith('ghp_')) {
    try {
      const ghRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
      })
      if (ghRes.ok) {
        const ghUser = await ghRes.json()
        const email = ghUser.email || (ghUser.login ? `${ghUser.login}@github` : 'jjsch1410@gmail.com')
        return { id: String(ghUser.id || 'gh_user'), email, superuser: true } as Profile
      }
    } catch {
      // ignore
    }
  }

  // 3. Try JWT payload decoding
  const jwtData = decodeJwtPayload(token)
  const decodedEmail =
    jwtData?.email ||
    jwtData?.user?.email ||
    jwtData?.user_email ||
    jwtData?.preferred_username ||
    jwtData?.username ||
    jwtData?.login ||
    (jwtData?.identity && typeof jwtData.identity === 'string' && jwtData.identity.includes('@') ? jwtData.identity : null) ||
    'jjsch1410@gmail.com'

  return {
    id: jwtData?.sub || jwtData?.identity || 'drive_owner',
    email: decodedEmail,
    superuser: true,
  } as Profile
}

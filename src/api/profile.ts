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
  const jwtData = decodeJwtPayload(token)

  try {
    const data = await fetcher<Profile>('/v1/me/')
    if (data && data.email) {
      return data
    }
  } catch {
    // API backend endpoint /v1/me/ not available yet on self-hosted
  }

  const fallbackEmail = jwtData?.email || jwtData?.login || jwtData?.name || jwtData?.identity || (token ? 'Drive User' : 'Nicht angemeldet')

  return {
    id: jwtData?.sub || jwtData?.identity || 'drive_owner',
    email: fallbackEmail,
    superuser: true,
  } as Profile
}

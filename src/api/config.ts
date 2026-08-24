const isBrowser = typeof window !== 'undefined'
const defaultBaseUrl = isBrowser && window.location.hostname !== 'localhost' ? window.location.origin : 'https://drive.markenjaden.de'
const defaultWsUrl = defaultBaseUrl.replace(/^http/, 'ws') + '/ws'

export const API_URL = import.meta.env.VITE_API_URL || defaultBaseUrl
export const ATHENA_URL = import.meta.env.VITE_ATHENA_URL || defaultWsUrl
export const BILLING_URL = 'https://billing.comma.ai'
export const USERADMIN_URL = import.meta.env.VITE_USERADMIN_URL || `${API_URL}/useradmin`


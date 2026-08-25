import { createSignal, onMount, Show } from 'solid-js'
import { useNavigate, useLocation, useSearchParams } from '@solidjs/router'

import { refreshAccessToken, setAccessToken } from '~/api/auth/client'
import Button from '~/components/material/Button'
import Icon from '~/components/material/Icon'

type AuthParams = {
  code?: string
  provider?: string
  jwt?: string
  token?: string
  access_token?: string
  state?: string
}

export default function Auth() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams<AuthParams>()
  const [error, setError] = createSignal<string | null>(null)
  const [_loading, setLoading] = createSignal(true)

  onMount(() => {
    // Check query params or hash for direct JWT/access tokens
    const queryJwt = params.jwt || params.token || params.access_token
    let hashToken: string | null = null

    if (window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      hashToken = hashParams.get('jwt') || hashParams.get('token') || hashParams.get('access_token')
    }

    const directToken = queryJwt || hashToken
    if (directToken) {
      setAccessToken(directToken)
      setLoading(false)
      navigate('/', { replace: true })
      return
    }

    const code = params.code
    if (code) {
      // Determine provider: 'h' for GitHub, 'g' for Google, 'a' for Apple
      let provider = params.provider
      if (!provider) {
        if (location.pathname.includes('/h/')) provider = 'h'
        else if (location.pathname.includes('/g/')) provider = 'g'
        else if (location.pathname.includes('/a/')) provider = 'a'
        else provider = 'h'
      }

      refreshAccessToken(code, provider)
        .then(() => {
          setLoading(false)
          navigate('/', { replace: true })
        })
        .catch((err) => {
          console.error('[Auth Error]', err)
          setLoading(false)
          if (err instanceof Error && err.message) {
            setError(err.message)
          } else {
            setError('Could not complete authentication.')
          }
        })
      return
    }

    // If neither token nor code is present, navigate back to login
    setLoading(false)
    navigate('/login', { replace: true })
  })

  return (
    <div class="flex min-h-screen max-w-lg flex-col gap-8 items-center mx-auto justify-center text-on-background bg-background p-6">
      <div class="flex flex-col gap-4 items-center">
        <img src="/images/logo-connect-light.svg" alt="Drive" width={96} height={96} />
        <h1 class="text-2xl font-extrabold">Drive</h1>
      </div>
      <Show
        when={error()}
        fallback={
          <div class="flex items-center gap-3">
            <Icon class="animate-spin" name="autorenew" size="24" />
            <p class="text-lg">Authenticating with GitHub...</p>
          </div>
        }
      >
        <div class="flex flex-col gap-4 items-center text-center">
          <div class="flex gap-3 items-center text-error">
            <Icon name="error" size="28" />
            <span class="text-md font-semibold">{error()}</span>
          </div>
          <p class="text-xs text-on-surface-variant max-w-sm">
            Please ensure that your GitHub OAuth App Authorization Callback URL is set to <code class="bg-surface-container-highest px-1.5 py-0.5 rounded text-primary">https://drive.markenjaden.de/v2/auth/h/redirect/</code>.
          </p>
          <Button color="primary" href="/login">
            Return to Login
          </Button>
        </div>
      </Show>
    </div>
  )
}

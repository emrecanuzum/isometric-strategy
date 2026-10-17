import { createClient } from '@supabase/supabase-js'

// A session the server no longer accepts (expired beyond refresh, revoked, the account gone) answers 401 to the
// database and the functions. The player is then signed out here, which takes them back to the sign-in screen (see
// Root); the sign-in calls themselves are left alone, as they answer for themselves.
let leaving = false
const guarded: typeof fetch = async (input, init) => {
  const response = await fetch(input, init)
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (response.status === 401 && !url.includes('/auth/v1/') && !leaving) {
    leaving = true
    // Outside the request, so the sign-out does not wait on the call that is still being answered.
    // A 401 may only mean the access token ran out while its refresh failed for a moment (a busy server): the session
    // is refreshed first, and the player is signed out only when the server turns the refresh down itself.
    setTimeout(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!data.session) return
        const { error } = await supabase.auth.refreshSession()
        const refused = error && typeof error.status === 'number' && error.status >= 400 && error.status < 500
        if (refused) await supabase.auth.signOut({ scope: 'local' })
      } finally {
        leaving = false
      }
    }, 0)
  }
  return response
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { global: { fetch: guarded } },
)

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
    setTimeout(async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) await supabase.auth.signOut({ scope: 'local' })
      leaving = false
    }, 0)
  }
  return response
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { global: { fetch: guarded } },
)

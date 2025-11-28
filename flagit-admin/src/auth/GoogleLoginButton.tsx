import { useEffect, useRef } from 'react'
import axios from 'axios'

export default function GoogleLoginButton({
  onLogin,
}: {
  onLogin: (jwt: string, email: string) => void
}) {
  const divRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // @ts-ignore
    if (!window.google) return
    // @ts-ignore
    window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      callback: async (resp: any) => {
        try {
          const { data } = await axios.post(
            `${import.meta.env.VITE_API_BASE}/auth/google`,
            { id_token: resp.credential }
          )
          onLogin(data.jwt, data.email)
        } catch (e) {
          alert('Not authorized')
        }
      },
    })
    // @ts-ignore
    window.google.accounts.id.renderButton(divRef.current, {
      theme: 'outline',
      size: 'large',
    })
  }, [])

  return <div ref={divRef} />
}

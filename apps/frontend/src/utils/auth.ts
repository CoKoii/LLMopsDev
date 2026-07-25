const getPersistedAuth = () => {
  try {
    return JSON.parse(localStorage.getItem('auth') || '{}') as {
      accessToken?: string
      refreshToken?: string
    }
  } catch {
    return {}
  }
}

export function getAccessToken() {
  return getPersistedAuth().accessToken
}

export function getRefreshToken() {
  return getPersistedAuth().refreshToken
}

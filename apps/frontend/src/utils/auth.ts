export function getAccessToken() {
  const auth = JSON.parse(localStorage.getItem('auth') || '{}')
  return auth.accessToken
}

export function getRefreshToken() {
  const auth = JSON.parse(localStorage.getItem('auth') || '{}')
  return auth.refreshToken
}

export async function handler() {
  const baseUrl = (process.env.SNOW_BASE_URL || '').trim()
  const clientId = (process.env.SNOW_CLIENT_ID || '').trim()
  const clientSecret = (process.env.SNOW_CLIENT_SECRET || '').trim()

  const managedAuthEnabled = Boolean(baseUrl && clientId && clientSecret)

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify({
      managedAuthEnabled,
      baseUrl: managedAuthEnabled ? baseUrl : ''
    })
  }
}

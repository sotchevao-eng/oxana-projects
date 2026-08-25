/** Random opaque public token (not derived from DB ids). */
export function createPublicToken(byteLength = 24): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function getPublicOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return ''
}

export function getBriefPublicUrl(token: string): string {
  return `${getPublicOrigin()}/brief/${token}`
}

export function getProposalPublicUrl(token: string): string {
  return `${getPublicOrigin()}/proposal/${token}`
}

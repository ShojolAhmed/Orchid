/**
 * PKCE (RFC 7636) and OAuth `state` helpers. All randomness comes from Web Crypto;
 * nothing here ever logs or stores a value.
 */

type CryptoLike = Pick<Crypto, 'getRandomValues' | 'subtle'>

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomBase64Url(byteLength: number, crypto: CryptoLike): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)))
}

/** 64 random bytes become 86 URL-safe characters, inside RFC 7636's 43 to 128 range. Alphabet is unreserved characters only. */
export function createCodeVerifier(crypto: CryptoLike = globalThis.crypto): string {
  return randomBase64Url(64, crypto)
}

/** `code_challenge` for method S256: BASE64URL(SHA256(ASCII(verifier))). */
export async function createCodeChallenge(verifier: string, crypto: CryptoLike = globalThis.crypto): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64UrlEncode(new Uint8Array(digest))
}

/** Unguessable per-attempt value that ties the callback to the attempt that started it (CSRF protection). */
export function createState(crypto: CryptoLike = globalThis.crypto): string {
  return randomBase64Url(32, crypto)
}

/** Compares without bailing out at the first difference. The state is not a long-lived secret, but this costs nothing. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

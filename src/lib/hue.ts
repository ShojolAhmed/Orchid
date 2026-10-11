/** Stable hue (0 to 359) for a string, so an item without artwork keeps the same placeholder gradient. */
export function hueFromString(value: string): number {
  let hash = 0
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return hash
}

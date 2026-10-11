import { createContext, useContext } from 'react'
import type { PlayerApi } from './types'

export const PlayerContext = createContext<PlayerApi | null>(null)

export function usePlayer(): PlayerApi {
  const value = useContext(PlayerContext)
  if (!value) throw new Error('usePlayer must be used inside a player provider')
  return value
}

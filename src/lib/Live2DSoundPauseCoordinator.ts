export type ManagedLive2DSound = {
  isPlaying: boolean
  pause(): unknown
  resume(): unknown
}

export class Live2DSoundPauseCoordinator {
  private readonly getManagerCandidate: () => unknown
  private readonly owners: Set<object> = new Set()
  private readonly pausedSounds: Set<ManagedLive2DSound> = new Set()

  constructor(getManagerCandidate: () => unknown) {
    this.getManagerCandidate = getManagerCandidate
  }

  pause(owner: object): void {
    this.owners.add(owner)
    this.synchronize()
  }

  synchronize(): void {
    if (this.owners.size === 0) return

    for (const audio of this.getManagedSounds()) {
      if (!audio.isPlaying || this.pausedSounds.has(audio)) continue
      this.pausedSounds.add(audio)
      audio.pause()
    }
  }

  resume(owner: object): void {
    if (!this.owners.delete(owner) || this.owners.size > 0) return

    const managedSounds: Set<ManagedLive2DSound> = new Set(this.getManagedSounds())
    for (const audio of this.pausedSounds) {
      if (managedSounds.has(audio)) audio.resume()
    }
    this.pausedSounds.clear()
  }

  private getManagedSounds(): ManagedLive2DSound[] {
    const candidate: unknown = this.getManagerCandidate()
    const candidateType: string = typeof candidate
    if (!candidate || (candidateType !== 'object' && candidateType !== 'function')) {
      return []
    }

    const audios: unknown = (candidate as { audios?: unknown }).audios
    return Array.isArray(audios) ? audios.filter(isManagedLive2DSound) : []
  }
}

function isManagedLive2DSound(value: unknown): value is ManagedLive2DSound {
  if (!value || typeof value !== 'object') return false
  const candidate: Record<string, unknown> = value as Record<string, unknown>
  return (
    typeof candidate.isPlaying === 'boolean' &&
    typeof candidate.pause === 'function' &&
    typeof candidate.resume === 'function'
  )
}

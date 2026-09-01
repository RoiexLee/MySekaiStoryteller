import { StoryAbortError } from './types'

export type StoryVoiceModel = {
  speak(
    sound: string,
    options?: {
      volume?: number
      onFinish?: () => void
      onError?: (error: Error) => void
    }
  ): Promise<boolean>
  stopSpeaking(): void
}

export function playModelVoice(
  model: StoryVoiceModel,
  voiceUrl: string,
  volume: number,
  signal?: AbortSignal,
  onStarted?: () => void
): Promise<void> {
  if (signal?.aborted) return Promise.reject(new StoryAbortError())

  return new Promise<void>((resolve: () => void, reject: (reason?: unknown) => void): void => {
    let settled: boolean = false

    const cleanup = (): boolean => {
      if (settled) return false
      settled = true
      signal?.removeEventListener('abort', abort)
      return true
    }
    const finish = (): void => {
      if (cleanup()) resolve()
    }
    const fail = (error: unknown): void => {
      if (cleanup()) reject(error)
    }
    const stopSpeaking = (): void => {
      try {
        model.stopSpeaking()
      } catch {
        // Cancellation still needs to settle even if the engine has already destroyed the audio.
      }
    }
    const abort = (): void => {
      stopSpeaking()
      fail(new StoryAbortError())
    }

    signal?.addEventListener('abort', abort, { once: true })

    let startTask: Promise<boolean>
    try {
      startTask = model.speak(voiceUrl, {
        volume,
        onFinish: finish,
        onError: fail
      })
    } catch (error: unknown) {
      fail(error)
      return
    }

    void startTask
      .then((started: boolean): void => {
        if (signal?.aborted) {
          if (started) stopSpeaking()
          fail(new StoryAbortError())
          return
        }
        if (!started) {
          finish()
          return
        }
        onStarted?.()
      })
      .catch(fail)
  })
}

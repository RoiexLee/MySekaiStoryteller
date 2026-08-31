import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  appType: 'custom',
  server: { middlewareMode: true }
})

try {
  const { playModelVoice } = await server.ssrLoadModule('/src/story/modelVoice.ts')
  const { StoryAbortError } = await server.ssrLoadModule('/src/story/types.ts')

  let finishVoice
  let stopCalls = 0
  const completingModel = {
    async speak(_voiceUrl, options) {
      finishVoice = options.onFinish
      return true
    },
    stopSpeaking() {
      stopCalls += 1
    }
  }
  const completingTask = playModelVoice(completingModel, 'voice.ogg', 0.5)
  finishVoice()
  await completingTask
  assert.equal(stopCalls, 0)

  const activeController = new globalThis.AbortController()
  stopCalls = 0
  const activeModel = {
    async speak() {
      return true
    },
    stopSpeaking() {
      stopCalls += 1
    }
  }
  const activeTask = playModelVoice(activeModel, 'voice.ogg', 0.5, activeController.signal)
  await Promise.resolve()
  const activeRejection = assert.rejects(activeTask, (error) => error instanceof StoryAbortError)
  activeController.abort()
  await activeRejection
  assert.equal(stopCalls, 1)

  const loadingController = new globalThis.AbortController()
  let resolveLoading
  stopCalls = 0
  const loadingModel = {
    speak() {
      return new Promise((resolve) => {
        resolveLoading = resolve
      })
    },
    stopSpeaking() {
      stopCalls += 1
    }
  }
  const loadingTask = playModelVoice(loadingModel, 'loading.ogg', 0.5, loadingController.signal)
  const loadingRejection = assert.rejects(loadingTask, (error) => error instanceof StoryAbortError)
  loadingController.abort()
  await loadingRejection
  assert.equal(stopCalls, 1)
  resolveLoading(true)
  await Promise.resolve()
  assert.equal(stopCalls, 2)

  const preCancelledController = new globalThis.AbortController()
  preCancelledController.abort()
  let preCancelledStarts = 0
  const preCancelledModel = {
    async speak() {
      preCancelledStarts += 1
      return true
    },
    stopSpeaking() {
      throw new Error('A voice that never started must not be stopped')
    }
  }
  await assert.rejects(
    playModelVoice(preCancelledModel, 'cancelled.ogg', 0.5, preCancelledController.signal),
    (error) => error instanceof StoryAbortError
  )
  assert.equal(preCancelledStarts, 0)

  const { default: StoryDispatcher } = await server.ssrLoadModule('/src/story/StoryDispatcher.ts')
  const calls = []
  let dialogueSignal
  const scene = {
    fastForwarding: false,
    setFastForwarding(enabled) {
      this.fastForwarding = enabled
    },
    async restoreState() {},
    commitState() {},
    invalidateState() {
      calls.push('invalidate')
    },
    showDialogue(_options, signal) {
      dialogueSignal = signal
      return new Promise((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            calls.push('voice-abort')
            reject(new StoryAbortError())
          },
          { once: true }
        )
      })
    }
  }
  const clock = {
    async delay() {},
    async waitForResume() {},
    pause() {
      calls.push('pause')
    },
    resume() {},
    interrupt() {
      calls.push('interrupt')
    }
  }
  const story = {
    version: 1,
    snippets: [
      {
        id: 'talk',
        type: 'Talk',
        delay: 0,
        data: {
          speaker: 'Miku',
          content: 'Test',
          model: 'miku',
          voice: 'voice'
        }
      }
    ]
  }
  const dispatcher = new StoryDispatcher({ scene, clock })
  const runTask = dispatcher.run(story)
  for (let index = 0; index < 10 && !dialogueSignal; index += 1) {
    await Promise.resolve()
  }
  assert.ok(dialogueSignal)
  dispatcher.pause()
  dispatcher.cancel()
  await runTask
  assert.equal(dispatcher.currentStatus, 'cancelled')
  assert.equal(dialogueSignal.aborted, true)
  assert.deepEqual(calls, ['pause', 'interrupt', 'voice-abort', 'invalidate'])
} finally {
  await server.close()
}

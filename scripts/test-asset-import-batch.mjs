import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true }
})

try {
  const { importAssetsSequentially } = await server.ssrLoadModule(
    '/src/windows/editor/importAssetsSequentially.ts'
  )

  const backgroundOrder = []
  let activeImports = 0
  let maximumActiveImports = 0
  const backgroundResult = await importAssetsSequentially(
    ['classroom.png', 'school.jpg', 'rooftop.webp'],
    async (sourcePath) => {
      activeImports += 1
      maximumActiveImports = Math.max(maximumActiveImports, activeImports)
      backgroundOrder.push(`start:${sourcePath}`)
      await Promise.resolve()
      backgroundOrder.push(`finish:${sourcePath}`)
      activeImports -= 1
      return sourcePath.toUpperCase()
    },
    (result, sourcePath) => backgroundOrder.push(`saved:${sourcePath}:${result}`)
  )

  assert.equal(backgroundResult.successCount, 3)
  assert.deepEqual(backgroundResult.failures, [])
  assert.equal(maximumActiveImports, 1)
  assert.deepEqual(backgroundOrder, [
    'start:classroom.png',
    'finish:classroom.png',
    'saved:classroom.png:CLASSROOM.PNG',
    'start:school.jpg',
    'finish:school.jpg',
    'saved:school.jpg:SCHOOL.JPG',
    'start:rooftop.webp',
    'finish:rooftop.webp',
    'saved:rooftop.webp:ROOFTOP.WEBP'
  ])

  const attemptedVoices = []
  const importedVoices = []
  const voiceFailure = 'unsupported audio content'
  const voiceResult = await importAssetsSequentially(
    ['intro.ogg', 'broken.wav', 'outro.m4a'],
    async (sourcePath) => {
      attemptedVoices.push(sourcePath)
      if (sourcePath === 'broken.wav') throw voiceFailure
      return { key: sourcePath.replace('.', '-') }
    },
    (result) => importedVoices.push(result.key)
  )

  assert.deepEqual(attemptedVoices, ['intro.ogg', 'broken.wav', 'outro.m4a'])
  assert.deepEqual(importedVoices, ['intro-ogg', 'outro-m4a'])
  assert.equal(voiceResult.successCount, 2)
  assert.equal(voiceResult.failures.length, 1)
  assert.equal(voiceResult.failures[0].sourcePath, 'broken.wav')
  assert.equal(voiceResult.failures[0].error, voiceFailure)

  const allFailedPaths = []
  const allFailedResult = await importAssetsSequentially(
    ['missing.mp3', 'invalid.ogg'],
    async (sourcePath) => {
      allFailedPaths.push(sourcePath)
      throw new Error(`failed:${sourcePath}`)
    },
    () => assert.fail('The success callback must not run for failed imports')
  )

  assert.deepEqual(allFailedPaths, ['missing.mp3', 'invalid.ogg'])
  assert.equal(allFailedResult.successCount, 0)
  assert.equal(allFailedResult.failures.length, 2)
  assert.match(allFailedResult.failures[0].error.message, /missing\.mp3/)
  assert.match(allFailedResult.failures[1].error.message, /invalid\.ogg/)
} finally {
  await server.close()
}

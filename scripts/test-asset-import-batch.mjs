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
  const { registerExistingModelsSequentially } = await server.ssrLoadModule(
    '/src/windows/editor/registerExistingModelsSequentially.ts'
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

  const attemptedModels = []
  const registeredModels = []
  const modelFailure = 'global model is unavailable'
  const modelResult = await registerExistingModelsSequentially(
    [
      { modelId: 'miku', key: 'lead-miku', name: 'Lead Miku' },
      { modelId: 'missing-model', key: 'missing-key' },
      { modelId: 'rin', name: 'Guest Rin' }
    ],
    async (modelId, key, name) => {
      attemptedModels.push({ modelId, key, name })
      if (modelId === 'missing-model') throw modelFailure
      return { key: `${modelId}-asset` }
    },
    (result, modelId) => registeredModels.push({ modelId, key: result.key })
  )

  assert.deepEqual(attemptedModels, [
    { modelId: 'miku', key: 'lead-miku', name: 'Lead Miku' },
    { modelId: 'missing-model', key: 'missing-key', name: undefined },
    { modelId: 'rin', key: undefined, name: 'Guest Rin' }
  ])
  assert.deepEqual(registeredModels, [
    { modelId: 'miku', key: 'miku-asset' },
    { modelId: 'rin', key: 'rin-asset' }
  ])
  assert.equal(modelResult.successCount, 2)
  assert.equal(modelResult.failures.length, 1)
  assert.equal(modelResult.failures[0].modelId, 'missing-model')
  assert.equal(modelResult.failures[0].error, modelFailure)

  const customRegistrations = []
  const singleModelResult = await registerExistingModelsSequentially(
    [{ modelId: 'len', key: 'lead-vocal', name: 'Lead vocal' }],
    async (modelId, key, name) => {
      customRegistrations.push({ modelId, key, name })
      return { key }
    },
    () => undefined
  )

  assert.deepEqual(customRegistrations, [{ modelId: 'len', key: 'lead-vocal', name: 'Lead vocal' }])
  assert.equal(singleModelResult.successCount, 1)
  assert.deepEqual(singleModelResult.failures, [])

  const failedModelResult = await registerExistingModelsSequentially(
    [{ modelId: 'missing-a' }, { modelId: 'missing-b' }],
    async (modelId) => {
      throw new Error(`failed:${modelId}`)
    },
    () => assert.fail('The success callback must not run when every model registration fails')
  )

  assert.equal(failedModelResult.successCount, 0)
  assert.deepEqual(
    failedModelResult.failures.map((failure) => failure.modelId),
    ['missing-a', 'missing-b']
  )
  assert.match(failedModelResult.failures[0].error.message, /missing-a/)
  assert.match(failedModelResult.failures[1].error.message, /missing-b/)

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

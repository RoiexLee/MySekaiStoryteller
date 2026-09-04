import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true }
})

try {
  const { fuzzyMatchOptions } = await server.ssrLoadModule('/src/lib/fuzzyMatch.ts')
  const options = Array.from(
    { length: 100 },
    (_, index) => `face_test_${String(index + 1).padStart(3, '0')}`
  )

  const defaultListOptions = fuzzyMatchOptions(options, '', 60)
  assert.equal(defaultListOptions.length, 100)
  assert.deepEqual(defaultListOptions, options)
  assert.ok(defaultListOptions.includes('face_test_100'))

  const broadSearchOptions = fuzzyMatchOptions(options, 'face_test', 60)
  assert.equal(broadSearchOptions.length, 60)

  const exactSearchOptions = fuzzyMatchOptions(options, 'face_test_100', 60)
  assert.ok(exactSearchOptions.includes('face_test_100'))
} finally {
  await server.close()
}

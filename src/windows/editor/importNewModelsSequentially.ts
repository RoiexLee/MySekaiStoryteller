export interface NewModelImportFailure {
  readonly sourcePath: string
  readonly error: unknown
}

export interface NewModelImportRequest {
  readonly sourcePath: string
  readonly archiveEntry?: string
  readonly key?: string
  readonly name?: string
}

export interface NewModelImportResult {
  readonly successCount: number
  readonly failures: readonly NewModelImportFailure[]
}

export async function importNewModelsSequentially<
  TImported extends { readonly modelId: string },
  TRegistered
>(
  requests: readonly NewModelImportRequest[],
  importOne: (
    sourcePath: string,
    name: string | undefined,
    archiveEntry: string | undefined
  ) => Promise<TImported>,
  registerOne: (
    modelId: string,
    key: string | undefined,
    name: string | undefined
  ) => Promise<TRegistered>,
  onImported: (result: TImported, request: NewModelImportRequest) => void,
  onRegistered: (result: TRegistered, request: NewModelImportRequest) => void
): Promise<NewModelImportResult> {
  let successCount: number = 0
  const failures: NewModelImportFailure[] = []

  for (const request of requests) {
    try {
      const imported: TImported = await importOne(
        request.sourcePath,
        request.name,
        request.archiveEntry
      )
      onImported(imported, request)
      const registered: TRegistered = await registerOne(imported.modelId, request.key, request.name)
      onRegistered(registered, request)
      successCount += 1
    } catch (error: unknown) {
      failures.push({ sourcePath: request.sourcePath, error })
    }
  }

  return { successCount, failures }
}

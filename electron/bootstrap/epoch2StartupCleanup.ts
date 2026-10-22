/**
 * Runs the post-bootstrap startup steps and closes the committed runtime when
 * one of them fails (P1-06). Without this, the database, credential services
 * and root lease stay open until process exit, because the shutdown
 * coordinator is registered only at the end of a successful start.
 */
export async function startWithEpoch2RuntimeCleanup(
  runtime: Readonly<{ epoch2: Readonly<{ close: () => Promise<void> }> }>,
  start: () => Promise<void>,
  log: (line: string) => void = (line) => { process.stderr.write(line) },
): Promise<void> {
  try {
    await start()
  } catch (error) {
    try {
      await runtime.epoch2.close()
    } catch {
      log('[epoch2-startup] EPOCH2_STARTUP_RUNTIME_CLOSE_FAILED\n')
    }
    throw error
  }
}

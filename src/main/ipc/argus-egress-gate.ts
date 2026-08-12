// Why: Argus fork — user-initiated feedback/crash submissions would deliver user reports
// to Stably's endpoint. Central gate; unit tests opt back in via the vitest setup file
// (config/scripts/argus-upstream-test-env.ts) so upstream suites keep exercising the wire.
export function assertArgusFeedbackUploadAllowed(): void {
  if (process.env.ARGUS_ENABLE_FEEDBACK_UPLOAD !== '1') {
    throw new Error('feedback upload is disabled in this Argus build')
  }
}

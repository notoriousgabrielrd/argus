export function getOrcaCliCommandNameForPlatform(platform: NodeJS.Platform): string {
  if (platform === 'linux') {
    return 'argus'
  }
  if (platform === 'win32') {
    return 'argus.cmd'
  }
  return 'argus'
}

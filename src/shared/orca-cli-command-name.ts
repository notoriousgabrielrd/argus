export function getOrcaCliCommandNameForPlatform(platform: NodeJS.Platform): string {
  if (platform === 'linux') {
    return 'argus-ide'
  }
  if (platform === 'win32') {
    return 'orca.cmd'
  }
  return 'orca'
}

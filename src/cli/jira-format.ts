import type {
  JiraConnectionStatus,
  JiraCreateIssueResult,
  JiraIssueType,
  JiraProject
} from '../shared/jira-types'

export function formatJiraStatus(status: JiraConnectionStatus): string {
  if (!status.connected) {
    return 'Jira not connected. Connect it in the Argus Tasks panel.'
  }
  const lines = [`connected: yes`]
  if (status.viewer) {
    lines.push(`account: ${status.viewer.displayName ?? status.viewer.email ?? status.viewer.accountId}`)
  }
  const active = status.sites?.find((site) => site.id === status.activeSiteId) ?? status.sites?.[0]
  if (active) {
    lines.push(`site: ${active.siteUrl} (${active.id})`)
  }
  if (status.credentialError) {
    lines.push(`credentialError: ${status.credentialError}`)
  }
  return lines.join('\n')
}

export function formatJiraProjects(projects: JiraProject[]): string {
  if (projects.length === 0) {
    return 'No Jira projects found.'
  }
  return projects.map((project) => `${project.key}\t${project.name}\t${project.id}`).join('\n')
}

export function formatJiraIssueTypes(types: JiraIssueType[]): string {
  if (types.length === 0) {
    return 'No issue types found for this project.'
  }
  return types
    .map((type) => `${type.name}\t${type.id}${type.subtask === true ? '\t(subtask)' : ''}`)
    .join('\n')
}

export function formatJiraCreate(result: JiraCreateIssueResult): string {
  // Why: the runtime returns a discriminated union; the failure arm is turned
  // into a CLI error before it reaches the formatter, so this only prints the
  // success shape.
  return result.ok ? `${result.key}\t${result.url}` : result.error
}

export type JiraCreatePlan = {
  dryRun: true
  project: { id: string; key: string; name: string }
  issueType: { id: string; name: string }
  title: string
  descriptionChars: number
}

export function formatJiraCreatePlan(plan: JiraCreatePlan): string {
  return [
    'dry run: nothing was created',
    `project: ${plan.project.key} (${plan.project.id}) ${plan.project.name}`,
    `type: ${plan.issueType.name} (${plan.issueType.id})`,
    `title: ${plan.title}`,
    `description: ${plan.descriptionChars} chars`
  ].join('\n')
}

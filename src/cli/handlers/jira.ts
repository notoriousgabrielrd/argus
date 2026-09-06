import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type {
  JiraConnectionStatus,
  JiraCreateIssueResult,
  JiraIssueType,
  JiraProject
} from '../../shared/jira-types'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import {
  formatJiraCreate,
  formatJiraCreatePlan,
  formatJiraIssueTypes,
  formatJiraProjects,
  formatJiraStatus,
  type JiraCreatePlan
} from '../jira-format'
import { RuntimeClientError } from '../runtime-client'
import type { RuntimeClient } from '../runtime-client'

const JIRA_WRITE_TIMEOUT_MS = 75_000
// Jira Cloud rejects descriptions past ~32767 characters; fail locally with a
// readable error instead of shipping a request that the API bounces.
const JIRA_BODY_CAP = 32_000

// Matches "Tarefa" against "tarefa" and, on a copy-paste from the board UI,
// against "TAREFA" — accents included, since the Jira type names are localised.
function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
}

async function resolveProject(
  client: RuntimeClient,
  input: string,
  siteId: string | undefined
): Promise<JiraProject> {
  const response = await client.call<JiraProject[]>('jira.listProjects', { siteId })
  const projects = response.result
  const wanted = normalizeName(input)
  const match = projects.find(
    (project) =>
      project.id === input ||
      normalizeName(project.key) === wanted ||
      normalizeName(project.name) === wanted
  )
  if (!match) {
    throw new RuntimeClientError(
      'invalid_argument',
      `Unknown Jira project "${input}". Available: ${
        projects.map((project) => project.key).join(', ') || '(none)'
      }`
    )
  }
  return match
}

async function resolveIssueType(
  client: RuntimeClient,
  projectIdOrKey: string,
  input: string,
  siteId: string | undefined
): Promise<JiraIssueType> {
  const response = await client.call<JiraIssueType[]>('jira.listIssueTypes', {
    projectIdOrKey,
    siteId
  })
  const types = response.result
  const wanted = normalizeName(input)
  const match = types.find((type) => type.id === input || normalizeName(type.name) === wanted)
  if (!match) {
    throw new RuntimeClientError(
      'invalid_argument',
      `Unknown Jira issue type "${input}". Available: ${
        types.map((type) => type.name).join(', ') || '(none)'
      }`
    )
  }
  return match
}

async function readJiraBody(
  flags: Map<string, string | boolean>,
  cwd: string
): Promise<string | undefined> {
  const inline = getOptionalStringFlag(flags, 'body')
  const path = getOptionalStringFlag(flags, 'body-file')
  if (inline && path) {
    throw new RuntimeClientError('invalid_argument', 'Use either --body or --body-file, not both')
  }
  const body = path ? await readBodyFile(path, cwd) : inline
  if (body === undefined) {
    return undefined
  }
  if (body.length > JIRA_BODY_CAP) {
    throw new RuntimeClientError(
      'jira_body_too_large',
      `Jira description must be at most ${JIRA_BODY_CAP} characters`
    )
  }
  return body
}

async function readBodyFile(path: string, cwd: string): Promise<string> {
  if (path !== '-') {
    return await readFile(isAbsolute(path) ? path : join(cwd, path), 'utf8')
  }
  if (process.stdin.isTTY) {
    throw new RuntimeClientError('invalid_argument', 'stdin body requested but stdin is a TTY')
  }
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

export const JIRA_HANDLERS: Record<string, CommandHandler> = {
  'jira status': async ({ client, json }) => {
    const response = await client.call<JiraConnectionStatus>('jira.status', {})
    printResult(response, json, formatJiraStatus)
  },
  'jira project list': async ({ flags, client, json }) => {
    const response = await client.call<JiraProject[]>('jira.listProjects', {
      siteId: getOptionalStringFlag(flags, 'site')
    })
    printResult(response, json, formatJiraProjects)
  },
  'jira type list': async ({ flags, client, json }) => {
    const response = await client.call<JiraIssueType[]>('jira.listIssueTypes', {
      projectIdOrKey: getRequiredStringFlag(flags, 'project'),
      siteId: getOptionalStringFlag(flags, 'site')
    })
    printResult(response, json, formatJiraIssueTypes)
  },
  'jira create': async ({ flags, client, cwd, json }) => {
    const siteId = getOptionalStringFlag(flags, 'site')
    const title = getRequiredStringFlag(flags, 'title')
    const description = await readJiraBody(flags, cwd)
    const project = await resolveProject(client, getRequiredStringFlag(flags, 'project'), siteId)
    const issueType = await resolveIssueType(
      client,
      project.key,
      getRequiredStringFlag(flags, 'type'),
      siteId
    )

    if (flags.get('dry-run') === true) {
      const plan: JiraCreatePlan = {
        dryRun: true,
        project: { id: project.id, key: project.key, name: project.name },
        issueType: { id: issueType.id, name: issueType.name },
        title,
        descriptionChars: description?.length ?? 0
      }
      if (json) {
        console.log(JSON.stringify(plan, null, 2))
        return
      }
      console.log(formatJiraCreatePlan(plan))
      return
    }

    const response = await client.call<JiraCreateIssueResult>(
      'jira.createIssue',
      {
        siteId,
        projectId: project.id,
        issueTypeId: issueType.id,
        title,
        description
      },
      { timeoutMs: JIRA_WRITE_TIMEOUT_MS }
    )
    // Why: the runtime answers ok:true at the transport layer even when Jira
    // refused the create, so the failure arm has to become a CLI error or the
    // caller would read a success exit code on a card that does not exist.
    if (!response.result.ok) {
      throw new RuntimeClientError('jira_create_failed', response.result.error)
    }
    printResult(response, json, formatJiraCreate)
  }
}

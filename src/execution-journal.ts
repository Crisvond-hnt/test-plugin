import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type JournalEvent = {
  at: string
  tenantId?: string
  accountId?: string
  actorUserId?: string
  category: 'policy' | 'approval' | 'execution' | 'intent'
  action: string
  status: 'ALLOW' | 'DENY' | 'PENDING' | 'SUCCESS' | 'FAILED'
  reasonCode?: string
  details?: Record<string, unknown>
}

const JOURNAL_PATH = '/home/beaver/.openclaw/towns-agent-os-journal.jsonl'

export function writeJournalEvent(event: JournalEvent) {
  mkdirSync(dirname(JOURNAL_PATH), { recursive: true })
  appendFileSync(JOURNAL_PATH, `${JSON.stringify(event)}\n`, { encoding: 'utf8' })
}

export function getJournalPath() {
  return JOURNAL_PATH
}

import type { OpenClawPluginApi, PluginCommandContext } from 'openclaw/plugin-sdk'
import { existsSync, readFileSync } from 'node:fs'
import { getJournalPath } from './execution-journal.js'

function parseLimit(raw?: string): number {
  const m = String(raw ?? '').match(/(?:--limit\s+(\d+))/i)
  const n = m ? Number(m[1]) : 20
  if (!Number.isFinite(n) || n <= 0) return 20
  return Math.min(n, 200)
}

export function registerJournalCommand(api: OpenClawPluginApi) {
  api.registerCommand({
    name: 'journal',
    description: 'Show recent Towns Agent OS audit events',
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx: PluginCommandContext) => {
      const limit = parseLimit(ctx.args)
      const path = getJournalPath()
      if (!existsSync(path)) {
        return { text: `No journal entries yet.\nPath: ${path}` }
      }

      const lines = readFileSync(path, 'utf8').trim().split('\n').filter(Boolean)
      const tail = lines.slice(-limit)

      if (tail.length === 0) {
        return { text: `No journal entries yet.\nPath: ${path}` }
      }

      const out = ['Recent journal events:', `- path: ${path}`, `- showing: ${tail.length}`, '']
      for (const line of tail) {
        try {
          const ev = JSON.parse(line) as {
            at?: string
            category?: string
            action?: string
            status?: string
            reasonCode?: string
            accountId?: string
            actorUserId?: string
          }
          out.push(
            `- ${ev.at ?? 'unknown'} | ${ev.category ?? '?'}:${ev.action ?? '?'} | status=${ev.status ?? '?'}${ev.reasonCode ? ` reason=${ev.reasonCode}` : ''}${ev.accountId ? ` account=${ev.accountId}` : ''}${ev.actorUserId ? ` actor=${ev.actorUserId}` : ''}`,
          )
        } catch {
          out.push(`- ${line}`)
        }
      }

      return { text: out.join('\n') }
    },
  })
}

import type { OpenClawPluginApi, PluginCommandContext } from 'openclaw/plugin-sdk'
import { consumeApprovalByNonce, createApprovalRequest, listApprovals } from './approval-store.js'
import { writeJournalEvent } from './execution-journal.js'

function parseArgs(raw?: string): Record<string, string> {
  const tokens = (raw ?? '').match(/(?:"[^"]*"|'[^']*'|\S+)/g) ?? []
  const out: Record<string, string> = {}
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = tokens[i + 1]
    if (!next || next.startsWith('--')) {
      out[key] = 'true'
      continue
    }
    out[key] = next.replace(/^['"]|['"]$/g, '')
    i += 1
  }
  return out
}

export function registerApprovalCommand(api: OpenClawPluginApi) {
  api.registerCommand({
    name: 'approval',
    description: 'Approval request scaffold utilities (M1 foundation)',
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx: PluginCommandContext) => {
      const args = parseArgs(ctx.args)
      const op = String(args.op ?? 'list').toLowerCase()

      if (op === 'create') {
        const account = args.account ?? 'default'
        const action = args.action ?? 'executeTx'
        const requestedBy = args['requested-by'] ?? 'unknown'
        const payloadHash = args['payload-hash'] ?? 'sha256:pending'
        const req = createApprovalRequest({
          accountId: account,
          action,
          requestedBy,
          payloadHash,
        })
        writeJournalEvent({
          at: new Date().toISOString(),
          accountId: req.accountId,
          actorUserId: req.requestedBy,
          category: 'approval',
          action: 'create',
          status: 'PENDING',
          details: { id: req.id, nonce: req.nonce, payloadHash: req.payloadHash },
        })
        return {
          text: `✅ approval request created\n- id=${req.id}\n- nonce=${req.nonce}\n- action=${req.action}\n- expiresAt=${new Date(req.expiresAt).toISOString()}`,
        }
      }

      if (op === 'consume') {
        const nonce = String(args.nonce ?? '').trim().toUpperCase()
        const actor = String(args['actor-user-id'] ?? '').trim()
        if (!nonce || !actor) {
          return { text: 'Usage: /approval --op consume --nonce <NONCE> --actor-user-id <towns:user:...>' }
        }

        const res = consumeApprovalByNonce({ nonce, actorUserId: actor })
        writeJournalEvent({
          at: new Date().toISOString(),
          accountId: res.request?.accountId,
          actorUserId: actor,
          category: 'approval',
          action: 'consume',
          status: res.ok ? 'SUCCESS' : 'DENY',
          reasonCode: res.reasonCode,
          details: { nonce, requestId: res.request?.id },
        })

        if (!res.ok || !res.request) {
          return { text: `❌ approval consume denied (${res.reasonCode})` }
        }

        return {
          text: `✅ approval consumed\n- id=${res.request.id}\n- nonce=${res.request.nonce}\n- action=${res.request.action}\n- status=${res.request.status}`,
        }
      }

      const items = listApprovals(10)
      if (items.length === 0) {
        return { text: 'No approvals yet.' }
      }

      const lines = ['Recent approvals:']
      for (const item of items) {
        lines.push(
          `- id=${item.id} nonce=${item.nonce} status=${item.status} action=${item.action} account=${item.accountId}`,
        )
      }
      return { text: lines.join('\n') }
    },
  })
}

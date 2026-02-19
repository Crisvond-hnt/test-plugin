import type { OpenClawPluginApi, PluginCommandContext } from 'openclaw/plugin-sdk'
import { createApprovalRequest, listApprovals } from './approval-store.js'

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
        return {
          text: `✅ approval request created\n- id=${req.id}\n- nonce=${req.nonce}\n- action=${req.action}\n- expiresAt=${new Date(req.expiresAt).toISOString()}`,
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

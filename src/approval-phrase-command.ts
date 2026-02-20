import type { OpenClawPluginApi, PluginCommandContext } from 'openclaw/plugin-sdk'
import { consumeApprovalByNonce, rejectApprovalByNonce } from './approval-store.js'
import { writeJournalEvent } from './execution-journal.js'

function parsePhrase(raw?: string): { op?: 'approve' | 'reject'; nonce?: string; actor?: string } {
  const text = String(raw ?? '').trim()

  const approve = text.match(/APPROVE\s+TX\s+([A-Za-z0-9_-]+)/i)
  if (approve) {
    const actor = text.match(/--actor-user-id\s+([^\s]+)/i)?.[1]
    return { op: 'approve', nonce: approve[1].toUpperCase(), actor }
  }

  const reject = text.match(/REJECT\s+TX\s+([A-Za-z0-9_-]+)/i)
  if (reject) {
    const actor = text.match(/--actor-user-id\s+([^\s]+)/i)?.[1]
    return { op: 'reject', nonce: reject[1].toUpperCase(), actor }
  }

  return {}
}

function resolveActorUserId(ctx: PluginCommandContext, parsedActor?: string): string | undefined {
  if (parsedActor?.trim()) return parsedActor.trim()
  const anyCtx = ctx as unknown as { userId?: string; senderId?: string; from?: string }
  return anyCtx.userId ?? anyCtx.senderId ?? anyCtx.from
}

export function registerApprovalPhraseCommand(api: OpenClawPluginApi) {
  api.registerCommand({
    name: 'approval-phrase',
    description: 'Consume approval phrases: APPROVE TX <nonce> / REJECT TX <nonce>',
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx: PluginCommandContext) => {
      const parsed = parsePhrase(ctx.args)
      if (!parsed.op || !parsed.nonce) {
        return {
          text: 'Usage: /approval-phrase APPROVE TX <nonce> --actor-user-id <towns:user:...> (or REJECT TX <nonce> ...)',
        }
      }

      const actor = resolveActorUserId(ctx, parsed.actor)
      if (!actor) return { text: '❌ actor identity missing. Pass --actor-user-id <towns:user:...>.' }

      if (parsed.op === 'reject') {
        const result = rejectApprovalByNonce({ nonce: parsed.nonce, actorUserId: actor })
        writeJournalEvent({
          at: new Date().toISOString(),
          accountId: result.request?.accountId,
          actorUserId: actor,
          category: 'approval',
          action: 'phrase_reject',
          status: result.ok ? 'SUCCESS' : 'DENY',
          reasonCode: result.ok ? 'ALLOW' : result.reasonCode,
          details: { nonce: parsed.nonce, requestId: result.request?.id },
        })
        if (!result.ok) {
          return { text: `❌ reject denied (${result.reasonCode})` }
        }
        return { text: `✅ rejected approval nonce=${parsed.nonce} status=${result.request?.status}` }
      }

      const result = consumeApprovalByNonce({ nonce: parsed.nonce, actorUserId: actor })
      writeJournalEvent({
        at: new Date().toISOString(),
        accountId: result.request?.accountId,
        actorUserId: actor,
        category: 'approval',
        action: 'phrase_approve',
        status: result.ok ? 'SUCCESS' : 'DENY',
        reasonCode: result.reasonCode,
        details: { nonce: parsed.nonce, requestId: result.request?.id },
      })

      if (!result.ok) {
        return { text: `❌ approval denied (${result.reasonCode})` }
      }

      return {
        text: `✅ approval accepted\n- id=${result.request?.id}\n- nonce=${parsed.nonce}\n- status=${result.request?.status}`,
      }
    },
  })
}

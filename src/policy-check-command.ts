import type { OpenClawPluginApi, PluginCommandContext } from 'openclaw/plugin-sdk'
import { getCapabilitySnapshot } from './capabilities.js'
import { evaluatePolicyAction, type PolicyActionKind } from './policy-engine.js'
import { writeJournalEvent } from './execution-journal.js'

function parseArgs(raw?: string): { kind: PolicyActionKind; integration?: 'polymarket' | 'registry8004' | 'x402'; accountId?: string } {
  const tokens = (raw ?? '').match(/(?:"[^"]*"|'[^']*'|\S+)/g) ?? []
  const out: Record<string, string> = {}
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (!t.startsWith('--')) continue
    const key = t.slice(2)
    const next = tokens[i + 1]
    if (!next || next.startsWith('--')) continue
    out[key] = next.replace(/^['"]|['"]$/g, '')
    i += 1
  }

  const kindRaw = String(out.kind ?? 'read')
  const kind: PolicyActionKind =
    kindRaw === 'executeTx' || kindRaw === 'pay' || kindRaw === 'delegate' ? (kindRaw as PolicyActionKind) : 'read'

  const integrationRaw = String(out.integration ?? '')
  const integration =
    integrationRaw === 'polymarket' || integrationRaw === 'registry8004' || integrationRaw === 'x402'
      ? (integrationRaw as 'polymarket' | 'registry8004' | 'x402')
      : undefined

  return { kind, integration, accountId: out.account }
}

export function registerPolicyCheckCommand(api: OpenClawPluginApi) {
  api.registerCommand({
    name: 'policy-check',
    description: 'Check policy decision for an action (secret-safe)',
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx: PluginCommandContext) => {
      const args = parseArgs(ctx.args)
      const cfg = api.runtime.config.loadConfig()
      const cap = getCapabilitySnapshot(cfg, args.accountId)
      const decision = evaluatePolicyAction({ capability: cap, kind: args.kind, integration: args.integration })

      writeJournalEvent({
        at: new Date().toISOString(),
        accountId: cap.accountId,
        category: 'policy',
        action: `check:${args.kind}`,
        status: decision.allow ? 'ALLOW' : 'DENY',
        reasonCode: decision.reasonCode,
        details: { integration: args.integration },
      })

      return {
        text: [
          'Policy check:',
          `- account: ${cap.accountId}`,
          `- action: ${args.kind}`,
          `- integration: ${args.integration ?? 'n/a'}`,
          `- allow: ${decision.allow}`,
          `- reason: ${decision.reasonCode}`,
        ].join('\n'),
      }
    },
  })
}

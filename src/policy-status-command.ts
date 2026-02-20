import type { OpenClawPluginApi, PluginCommandContext } from 'openclaw/plugin-sdk'
import { getPolicySnapshot } from './owner-policy.js'

function parseAccountId(raw?: string): string | undefined {
  const tokens = (raw ?? '').match(/(?:"[^"]*"|'[^']*'|\S+)/g) ?? []
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== '--account') continue
    const next = tokens[i + 1]
    if (!next || next.startsWith('--')) return undefined
    return next.replace(/^['"]|['"]$/g, '')
  }
  return undefined
}

export function registerPolicyStatusCommand(api: OpenClawPluginApi) {
  api.registerCommand({
    name: 'policy-status',
    description: 'Show Towns owner/policy status (secret-safe)',
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx: PluginCommandContext) => {
      const accountId = parseAccountId(ctx.args)
      const cfg = api.runtime.config.loadConfig()
      const p = getPolicySnapshot(cfg, accountId)

      const lines = [
        'Towns policy status (secret-safe):',
        '',
        `- account: ${p.accountId}`,
        `- mode: ${p.mode}`,
        `- ownerCount: ${p.ownerUserIds.length}`,
        `- owners: ${p.ownerUserIds.length > 0 ? p.ownerUserIds.slice(0, 5).join(', ') : 'none'}`,
        `- maxPerTxUsd: ${p.limits.maxPerTxUsd ?? 'unset'}`,
        `- maxPerDayUsd: ${p.limits.maxPerDayUsd ?? 'unset'}`,
        '',
        'integrations:',
        `- polymarket: ${p.integrations.polymarketEnabled}`,
        `- registry8004: ${p.integrations.registry8004Enabled}`,
        `- x402: ${p.integrations.x402Enabled}`,
      ]

      return { text: lines.join('\n') }
    },
  })
}

import type { OpenClawPluginApi, PluginCommandContext } from 'openclaw/plugin-sdk'
import { getCapabilitySnapshot } from './capabilities.js'
import { evaluatePolicyAction } from './policy-engine.js'

function parseAccountId(raw?: string): string | undefined {
  const tokens = (raw ?? '').match(/(?:"[^"]*"|'[^']*'|\S+)/g) ?? []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token !== '--account') continue
    const next = tokens[i + 1]
    if (!next || next.startsWith('--')) return undefined
    return next.replace(/^['"]|['"]$/g, '')
  }
  return undefined
}

export function registerCapabilitiesCommand(api: OpenClawPluginApi) {
  api.registerCommand({
    name: 'capabilities',
    description: 'Show current Towns capability snapshot (secret-safe)',
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx: PluginCommandContext) => {
      const accountId = parseAccountId(ctx.args)
      const cfg = api.runtime.config.loadConfig()
      const c = getCapabilitySnapshot(cfg, accountId)

      const execDecision = evaluatePolicyAction({
        capability: c,
        kind: 'executeTx',
        integration: 'polymarket',
      })
      const payDecision = evaluatePolicyAction({
        capability: c,
        kind: 'pay',
        integration: 'x402',
      })

      const lines = [
        'Towns capability snapshot (secret-safe):',
        '',
        `- account: ${c.accountId}`,
        `- channelEnabled: ${c.channelEnabled}`,
        `- configured: ${c.configured}`,
        `- walletContext: ${c.walletContext}`,
        `- canSign: ${c.canSign}`,
        `- policyMode: ${c.policyMode}`,
        `- ownerCount: ${c.ownerCount}`,
        `- webhookPath: ${c.webhookPath}`,
        '',
        'integrations:',
        `- polymarket: ready=${c.integrations.polymarket.ready} execEnabled=${c.integrations.polymarket.execEnabled}`,
        `- registry8004: ready=${c.integrations.registry8004.ready}`,
        `- x402: ready=${c.integrations.x402.ready} payEnabled=${c.integrations.x402.payEnabled}`,
        '',
        'policy decisions:',
        `- executeTx(polymarket): allow=${execDecision.allow} reason=${execDecision.reasonCode}`,
        `- pay(x402): allow=${payDecision.allow} reason=${payDecision.reasonCode}`,
      ]

      return { text: lines.join('\n') }
    },
  })
}

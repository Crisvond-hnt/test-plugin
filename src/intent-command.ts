import type { OpenClawPluginApi, PluginCommandContext } from 'openclaw/plugin-sdk'
import { parseIntent } from './intent-router.js'
import { writeJournalEvent } from './execution-journal.js'
import { getCapabilitySnapshot } from './capabilities.js'
import { evaluatePolicyAction } from './policy-engine.js'

export function registerIntentCommand(api: OpenClawPluginApi) {
  api.registerCommand({
    name: 'intent',
    description: 'Parse a message into Towns Agent OS intent (M1 scaffold)',
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx: PluginCommandContext) => {
      const raw = String(ctx.args ?? '').trim()
      if (!raw) return { text: 'Usage: /intent <message>' }

      const parsed = parseIntent(raw)
      const cfg = api.runtime.config.loadConfig()
      const cap = getCapabilitySnapshot(cfg)
      let policyPreview = 'n/a'
      if (parsed.intent === 'policy_toggle_integration' || parsed.intent === 'policy_set_mode' || parsed.intent === 'policy_set_limits') {
        const d = evaluatePolicyAction({ capability: cap, kind: 'executeTx', integration: 'polymarket' })
        policyPreview = `${d.allow ? 'ALLOW' : 'DENY'}:${d.reasonCode}`
      }

      writeJournalEvent({
        at: new Date().toISOString(),
        category: 'intent',
        action: parsed.intent,
        status: 'SUCCESS',
        details: { confidence: parsed.confidence },
      })

      return {
        text: [
          'Intent parse (scaffold):',
          `- intent: ${parsed.intent}`,
          `- confidence: ${parsed.confidence}`,
          `- params: ${JSON.stringify(parsed.params)}`,
          `- policyPreview: ${policyPreview}`,
        ].join('\n'),
      }
    },
  })
}

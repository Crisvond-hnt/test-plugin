import type { OpenClawPluginApi, PluginCommandContext } from 'openclaw/plugin-sdk'
import { parseIntent } from './intent-router.js'
import { writeJournalEvent } from './execution-journal.js'

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
        ].join('\n'),
      }
    },
  })
}

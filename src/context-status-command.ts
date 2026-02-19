import type { OpenClawPluginApi, PluginCommandContext } from 'openclaw/plugin-sdk'
import { classifyTrustContext } from './context-classifier.js'

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

export function registerContextStatusCommand(api: OpenClawPluginApi) {
  api.registerCommand({
    name: 'context-status',
    description: 'Show current trust context classification scaffold',
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx: PluginCommandContext) => {
      const args = parseArgs(ctx.args)
      const tc = classifyTrustContext({
        isDm: args.dm === 'true',
        ownerPresent: args.owner === 'true',
        participantsAreAgentsOnly: args.agentsOnly === 'true',
        participantCount: args.count ? Number(args.count) : undefined,
      })

      return {
        text: [
          'Trust context (scaffold):',
          `- kind: ${tc.kind}`,
          `- ownerPresent: ${tc.ownerPresent}`,
          `- participantCount: ${tc.participantCount ?? 'unknown'}`,
        ].join('\n'),
      }
    },
  })
}

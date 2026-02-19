import type { OpenClawPluginApi, PluginCommandContext } from 'openclaw/plugin-sdk'
import { listTownsAccountIds, resolveTownsAccount } from './accounts.js'

function normalizeWebhookPath(accountId: string, webhookPath?: string): string {
  const configured = (webhookPath ?? '').trim()
  if (!configured) return `/towns/${accountId}/webhook`
  return configured.startsWith('/') ? configured : `/${configured}`
}

export function registerTownsHealthCommand(api: OpenClawPluginApi) {
  api.registerCommand({
    name: 'towns-health',
    description: 'Show secret-safe Towns account diagnostics',
    acceptsArgs: false,
    requireAuth: true,
    handler: async (_ctx: PluginCommandContext) => {
      const cfg = api.runtime.config.loadConfig()
      const accountIds = listTownsAccountIds(cfg)

      const lines: string[] = []
      lines.push('Towns diagnostics (secret-safe):')
      lines.push('')

      const channelEnabled = (cfg.channels?.towns as { enabled?: boolean } | undefined)?.enabled
      lines.push(`- channel.enabled: ${channelEnabled !== false}`)
      lines.push(`- accountCount: ${accountIds.length}`)
      lines.push('')

      for (const accountId of accountIds) {
        const account = resolveTownsAccount({ cfg, accountId })
        const webhookPath = normalizeWebhookPath(account.accountId, account.webhookPath)
        lines.push(`account=${account.accountId}`)
        lines.push(`  enabled=${account.enabled}`)
        lines.push(`  configured=${account.configured}`)
        lines.push(`  webhookPath=${webhookPath}`)
        lines.push(`  allowFromCount=${account.allowFrom.length}`)
        lines.push('')
      }

      lines.push('If inbound webhook returns 401, ensure:')
      lines.push('- appPrivateData/jwtSecret are correct for this account')
      lines.push('- webhook registration app address matches appPrivateData identity')

      return { text: lines.join('\n') }
    },
  })
}

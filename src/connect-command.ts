import type { OpenClawConfig, OpenClawPluginApi, PluginCommandContext } from 'openclaw/plugin-sdk'

type ParsedArgs = {
  appAddress?: string
  appPrivateData?: string
  jwtSecret?: string
  publicUrl?: string
  accountId: string
  allowFrom?: string
}

function parseArgs(raw?: string): ParsedArgs {
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

  return {
    appAddress: out['app-address'],
    appPrivateData: out['app-private-data'],
    jwtSecret: out['jwt-secret'],
    publicUrl: out['public-url'],
    accountId: out['account'] ?? 'default',
    allowFrom: out['allow-from'],
  }
}

function buildNextConfig(cfg: OpenClawConfig, args: ParsedArgs): OpenClawConfig {
  const webhookPath = `/towns/${args.accountId}/webhook`
  const existingChannels = (cfg.channels ?? {}) as Record<string, unknown>
  const towns = (existingChannels.towns ?? {}) as Record<string, unknown>
  const existingAccounts = (towns.accounts ?? {}) as Record<string, unknown>
  const account = (existingAccounts[args.accountId] ?? {}) as Record<string, unknown>

  const nextAccount: Record<string, unknown> = {
    ...account,
    enabled: true,
    appPrivateData: args.appPrivateData,
    jwtSecret: args.jwtSecret,
    webhookPath,
  }

  if (args.allowFrom?.trim()) {
    nextAccount.allowFrom = [args.allowFrom.trim()]
  }

  return {
    ...cfg,
    channels: {
      ...(cfg.channels ?? {}),
      towns: {
        ...towns,
        enabled: true,
        accounts: {
          ...existingAccounts,
          [args.accountId]: nextAccount,
        },
      },
    },
    plugins: {
      ...(cfg.plugins ?? {}),
      entries: {
        ...(cfg.plugins?.entries ?? {}),
        'openclaw-towns-plugin': {
          ...((cfg.plugins?.entries as Record<string, unknown> | undefined)?.['openclaw-towns-plugin'] as
            | Record<string, unknown>
            | undefined),
          enabled: true,
        },
      },
    },
  }
}

function usage() {
  return [
    'Usage:',
    '/connect-towns --app-address <0x...> --app-private-data <...> --jwt-secret <...> --public-url <https://host> [--account default] [--allow-from <streamId>]',
    '',
    'Security note: this command only writes local OpenClaw config.',
    'Webhook registration must be done separately in Towns/BotFather.',
  ].join('\n')
}

export function registerConnectTownsCommand(api: OpenClawPluginApi) {
  api.registerCommand({
    name: 'connect-towns',
    description: 'Configure OpenClaw Towns channel and webhook path (local config only)',
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx: PluginCommandContext) => {
      const args = parseArgs(ctx.args)
      if (!args.appPrivateData || !args.jwtSecret || !args.publicUrl) {
        return { text: usage() }
      }

      if (!/^[A-Za-z0-9_-]{1,48}$/.test(args.accountId)) {
        return { text: '❌ account must match [A-Za-z0-9_-] and be at most 48 characters.' }
      }

      const publicUrlTrimmed = args.publicUrl.trim()
      if (!/^https:\/\//i.test(publicUrlTrimmed)) {
        return { text: '❌ public-url must start with https:// (Towns webhook requires public HTTPS).' }
      }

      if (/localhost|127\.0\.0\.1/i.test(publicUrlTrimmed)) {
        return { text: '❌ public-url cannot be localhost/loopback for Towns webhooks.' }
      }

      const publicUrl = publicUrlTrimmed.replace(/\/$/, '')
      const webhookPath = `/towns/${args.accountId}/webhook`
      const webhookUrl = `${publicUrl}${webhookPath}`

      try {
        const cfg = api.runtime.config.loadConfig()
        const next = buildNextConfig(cfg, args)
        await api.runtime.config.writeConfigFile(next)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { text: `❌ Failed to write OpenClaw config: ${message}` }
      }

      const lines = [
        '✅ Towns channel config written (local machine only).',
        `- account: ${args.accountId}`,
        `- webhookPath: ${webhookPath}`,
        `- webhookUrl: ${webhookUrl}`,
        '- plugin enabled: openclaw-towns-plugin',
        '',
        'Next steps:',
        '1) restart gateway: openclaw gateway restart',
        '2) register webhook in Towns/App Registry using the webhookUrl above',
        '3) optional diagnostics: /towns-health',
        '',
        'This only adds Towns; it does not disable or alter Telegram/other channels.',
      ]

      return { text: lines.join('\n') }
    },
  })
}

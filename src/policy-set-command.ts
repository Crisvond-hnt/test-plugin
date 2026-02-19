import type { OpenClawConfig, OpenClawPluginApi, PluginCommandContext } from 'openclaw/plugin-sdk'
import { DEFAULT_ACCOUNT_ID } from './accounts.js'
import { isOwnerUser } from './owner-policy.js'

type Parsed = {
  accountId: string
  actorUserId?: string
  mode?: 'READ_ONLY' | 'CONFIRM_ALWAYS' | 'BOUNDED_AUTO'
  maxPerTxUsd?: number
  maxPerDayUsd?: number
}

function parseArgs(raw?: string): Parsed {
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

  const modeRaw = String(out.mode ?? '').toUpperCase()
  const mode =
    modeRaw === 'READ_ONLY' || modeRaw === 'CONFIRM_ALWAYS' || modeRaw === 'BOUNDED_AUTO'
      ? (modeRaw as Parsed['mode'])
      : undefined

  const maxPerTxUsd = out['max-per-tx-usd'] !== undefined ? Number(out['max-per-tx-usd']) : undefined
  const maxPerDayUsd = out['max-per-day-usd'] !== undefined ? Number(out['max-per-day-usd']) : undefined

  return {
    accountId: out.account ?? DEFAULT_ACCOUNT_ID,
    actorUserId: out['actor-user-id'],
    mode,
    maxPerTxUsd,
    maxPerDayUsd,
  }
}

function buildNextConfig(cfg: OpenClawConfig, input: Parsed): OpenClawConfig {
  const channels = (cfg.channels ?? {}) as Record<string, unknown>
  const towns = (channels.towns ?? {}) as Record<string, unknown>
  const accounts = (towns.accounts ?? {}) as Record<string, unknown>
  const account = (accounts[input.accountId] ?? {}) as Record<string, unknown>
  const policy = (account.policy ?? (towns.policy as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
  const limits = (policy.limits ?? {}) as Record<string, unknown>

  const nextPolicy: Record<string, unknown> = {
    ...policy,
    ...(input.mode ? { mode: input.mode } : {}),
    limits: {
      ...limits,
      ...(typeof input.maxPerTxUsd === 'number' && Number.isFinite(input.maxPerTxUsd)
        ? { maxPerTxUsd: input.maxPerTxUsd }
        : {}),
      ...(typeof input.maxPerDayUsd === 'number' && Number.isFinite(input.maxPerDayUsd)
        ? { maxPerDayUsd: input.maxPerDayUsd }
        : {}),
    },
  }

  return {
    ...cfg,
    channels: {
      ...(cfg.channels ?? {}),
      towns: {
        ...towns,
        accounts: {
          ...accounts,
          [input.accountId]: {
            ...account,
            policy: nextPolicy,
          },
        },
      },
    },
  }
}

export function registerPolicySetCommand(api: OpenClawPluginApi) {
  api.registerCommand({
    name: 'policy-set',
    description:
      'Update Towns policy fields (owner-gated). Example: /policy-set --actor-user-id towns:user:abc --mode CONFIRM_ALWAYS --max-per-tx-usd 75',
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx: PluginCommandContext) => {
      const args = parseArgs(ctx.args)
      if (!/^[A-Za-z0-9_-]{1,48}$/.test(args.accountId)) {
        return { text: '❌ invalid account id format' }
      }

      if (!args.mode && args.maxPerTxUsd === undefined && args.maxPerDayUsd === undefined) {
        return {
          text: 'Usage: /policy-set --actor-user-id <towns:user:...> [--account default] [--mode READ_ONLY|CONFIRM_ALWAYS|BOUNDED_AUTO] [--max-per-tx-usd N] [--max-per-day-usd N]',
        }
      }

      const cfg = api.runtime.config.loadConfig()

      if (!args.actorUserId) {
        return {
          text: '❌ owner-gated command: pass --actor-user-id <towns:user:...> to apply policy changes.',
        }
      }

      const ownerAllowed = isOwnerUser(cfg, args.actorUserId, args.accountId)
      if (!ownerAllowed) {
        const denied = {
          allow: false,
          reasonCode: 'DENY_NOT_OWNER',
          accountId: args.accountId,
          actorUserId: args.actorUserId,
          action: 'policy_set',
          at: new Date().toISOString(),
        }
        console.info('[towns][policy]', JSON.stringify(denied))
        return { text: `❌ denied (${denied.reasonCode}): actor ${args.actorUserId} is not listed in policy.allowedOwnerUserIds.` }
      }

      if (args.maxPerTxUsd !== undefined && (!Number.isFinite(args.maxPerTxUsd) || args.maxPerTxUsd < 0)) {
        return { text: '❌ max-per-tx-usd must be a non-negative number.' }
      }
      if (args.maxPerDayUsd !== undefined && (!Number.isFinite(args.maxPerDayUsd) || args.maxPerDayUsd < 0)) {
        return { text: '❌ max-per-day-usd must be a non-negative number.' }
      }

      const next = buildNextConfig(cfg, args)
      await api.runtime.config.writeConfigFile(next)

      console.info(
        '[towns][policy]',
        JSON.stringify({
          allow: true,
          reasonCode: 'ALLOW',
          accountId: args.accountId,
          actorUserId: args.actorUserId,
          action: 'policy_set',
          mode: args.mode,
          maxPerTxUsd: args.maxPerTxUsd,
          maxPerDayUsd: args.maxPerDayUsd,
          at: new Date().toISOString(),
        }),
      )

      const changes: string[] = []
      if (args.mode) changes.push(`mode=${args.mode}`)
      if (args.maxPerTxUsd !== undefined) changes.push(`maxPerTxUsd=${args.maxPerTxUsd}`)
      if (args.maxPerDayUsd !== undefined) changes.push(`maxPerDayUsd=${args.maxPerDayUsd}`)

      return {
        text: `✅ policy updated for account=${args.accountId} by ${args.actorUserId}\n- ${changes.join('\n- ')}`,
      }
    },
  })
}

import type { OpenClawConfig, OpenClawPluginApi, PluginCommandContext } from 'openclaw/plugin-sdk'
import { DEFAULT_ACCOUNT_ID } from './accounts.js'
import { isOwnerUser } from './owner-policy.js'
import { writeJournalEvent } from './execution-journal.js'

type Parsed = {
  accountId: string
  actorUserId?: string
  mode?: 'READ_ONLY' | 'CONFIRM_ALWAYS' | 'BOUNDED_AUTO'
  maxPerTxUsd?: number
  maxPerDayUsd?: number
  integration?: 'polymarket' | 'registry8004' | 'x402'
  integrationEnabled?: boolean
  integrationExecEnabled?: boolean
  integrationPayEnabled?: boolean
  ownerAdd?: string
  ownerRemove?: string
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

  const integrationRaw = String(out.integration ?? '').toLowerCase()
  const integration =
    integrationRaw === 'polymarket' || integrationRaw === 'registry8004' || integrationRaw === 'x402'
      ? (integrationRaw as Parsed['integration'])
      : undefined
  const integrationEnabled =
    out['integration-enabled'] !== undefined ? String(out['integration-enabled']).toLowerCase() === 'true' : undefined
  const integrationExecEnabled =
    out['integration-exec-enabled'] !== undefined
      ? String(out['integration-exec-enabled']).toLowerCase() === 'true'
      : undefined
  const integrationPayEnabled =
    out['integration-pay-enabled'] !== undefined
      ? String(out['integration-pay-enabled']).toLowerCase() === 'true'
      : undefined

  return {
    accountId: out.account ?? DEFAULT_ACCOUNT_ID,
    actorUserId: out['actor-user-id'],
    mode,
    maxPerTxUsd,
    maxPerDayUsd,
    integration,
    integrationEnabled,
    integrationExecEnabled,
    integrationPayEnabled,
    ownerAdd: out['owner-add'],
    ownerRemove: out['owner-remove'],
  }
}

function resolveActorUserId(ctx: PluginCommandContext, parsedActor?: string): string | undefined {
  if (parsedActor?.trim()) return parsedActor.trim()
  const anyCtx = ctx as unknown as { userId?: string; senderId?: string; from?: string }
  return anyCtx.userId ?? anyCtx.senderId ?? anyCtx.from
}

function buildNextConfig(cfg: OpenClawConfig, input: Parsed): OpenClawConfig {
  const channels = (cfg.channels ?? {}) as Record<string, unknown>
  const towns = (channels.towns ?? {}) as Record<string, unknown>
  const accounts = (towns.accounts ?? {}) as Record<string, unknown>
  const account = (accounts[input.accountId] ?? {}) as Record<string, unknown>
  const policy = (account.policy ?? (towns.policy as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
  const limits = (policy.limits ?? {}) as Record<string, unknown>

  const integrations = (policy.integrations ?? {}) as Record<string, Record<string, unknown>>
  const existingOwners = (policy.allowedOwnerUserIds ?? []) as string[]
  const ownerSet = new Set(existingOwners.map((v) => String(v)))
  if (input.ownerAdd?.trim()) ownerSet.add(input.ownerAdd.trim())
  if (input.ownerRemove?.trim()) ownerSet.delete(input.ownerRemove.trim())

  const nextPolicy: Record<string, unknown> = {
    ...policy,
    ...(input.mode ? { mode: input.mode } : {}),
    allowedOwnerUserIds: [...ownerSet],
    limits: {
      ...limits,
      ...(typeof input.maxPerTxUsd === 'number' && Number.isFinite(input.maxPerTxUsd)
        ? { maxPerTxUsd: input.maxPerTxUsd }
        : {}),
      ...(typeof input.maxPerDayUsd === 'number' && Number.isFinite(input.maxPerDayUsd)
        ? { maxPerDayUsd: input.maxPerDayUsd }
        : {}),
    },
    integrations:
      input.integration && input.integrationEnabled !== undefined
        ? {
            ...integrations,
            [input.integration]: {
              ...(integrations[input.integration] ?? {}),
              ...(input.integrationEnabled !== undefined ? { enabled: input.integrationEnabled } : {}),
              ...(input.integrationExecEnabled !== undefined ? { execEnabled: input.integrationExecEnabled } : {}),
              ...(input.integrationPayEnabled !== undefined ? { payEnabled: input.integrationPayEnabled } : {}),
            },
          }
        : integrations,
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

      if (!args.mode && args.maxPerTxUsd === undefined && args.maxPerDayUsd === undefined && args.integrationEnabled === undefined && args.integrationExecEnabled === undefined && args.integrationPayEnabled === undefined && !args.ownerAdd && !args.ownerRemove) {
        return {
          text: 'Usage: /policy-set --actor-user-id <towns:user:...> [--account default] [--mode READ_ONLY|CONFIRM_ALWAYS|BOUNDED_AUTO] [--max-per-tx-usd N] [--max-per-day-usd N] [--integration polymarket|registry8004|x402 --integration-enabled true|false --integration-exec-enabled true|false --integration-pay-enabled true|false] [--owner-add towns:user:...] [--owner-remove towns:user:...]',
        }
      }

      const cfg = api.runtime.config.loadConfig()
      const actorUserId = resolveActorUserId(ctx, args.actorUserId)

      if (!actorUserId) {
        return {
          text: '❌ owner-gated command: actor identity missing. Pass --actor-user-id <towns:user:...>.',
        }
      }

      const ownerAllowed = isOwnerUser(cfg, actorUserId, args.accountId)
      if (!ownerAllowed) {
        const denied = {
          allow: false,
          reasonCode: 'DENY_NOT_OWNER',
          accountId: args.accountId,
          actorUserId: actorUserId,
          action: 'policy_set',
          at: new Date().toISOString(),
        }
        console.info('[towns][policy]', JSON.stringify(denied))
        writeJournalEvent({
          at: denied.at,
          accountId: denied.accountId,
          actorUserId: denied.actorUserId,
          category: 'policy',
          action: denied.action,
          status: 'DENY',
          reasonCode: denied.reasonCode,
        })
        return { text: `❌ denied (${denied.reasonCode}): actor ${actorUserId} is not listed in policy.allowedOwnerUserIds.` }
      }

      if (args.maxPerTxUsd !== undefined && (!Number.isFinite(args.maxPerTxUsd) || args.maxPerTxUsd < 0)) {
        return { text: '❌ max-per-tx-usd must be a non-negative number.' }
      }
      if (args.maxPerDayUsd !== undefined && (!Number.isFinite(args.maxPerDayUsd) || args.maxPerDayUsd < 0)) {
        return { text: '❌ max-per-day-usd must be a non-negative number.' }
      }

      if (args.ownerAdd && args.ownerRemove && args.ownerAdd.trim() === args.ownerRemove.trim()) {
        return { text: '❌ owner-add and owner-remove cannot target the same user in one command.' }
      }

      const next = buildNextConfig(cfg, args)
      await api.runtime.config.writeConfigFile(next)

      const allowEvent = {
        allow: true,
        reasonCode: 'ALLOW',
        accountId: args.accountId,
        actorUserId: actorUserId,
        action: 'policy_set',
        mode: args.mode,
        maxPerTxUsd: args.maxPerTxUsd,
        maxPerDayUsd: args.maxPerDayUsd,
        integration: args.integration,
        integrationEnabled: args.integrationEnabled,
        integrationExecEnabled: args.integrationExecEnabled,
        integrationPayEnabled: args.integrationPayEnabled,
        ownerAdd: args.ownerAdd,
        ownerRemove: args.ownerRemove,
        at: new Date().toISOString(),
      }

      console.info('[towns][policy]', JSON.stringify(allowEvent))
      writeJournalEvent({
        at: allowEvent.at,
        accountId: allowEvent.accountId,
        actorUserId: allowEvent.actorUserId,
        category: 'policy',
        action: allowEvent.action,
        status: 'ALLOW',
        reasonCode: allowEvent.reasonCode,
        details: {
          mode: allowEvent.mode,
          maxPerTxUsd: allowEvent.maxPerTxUsd,
          maxPerDayUsd: allowEvent.maxPerDayUsd,
          integration: allowEvent.integration,
          integrationEnabled: allowEvent.integrationEnabled,
          integrationExecEnabled: allowEvent.integrationExecEnabled,
          integrationPayEnabled: allowEvent.integrationPayEnabled,
          ownerAdd: allowEvent.ownerAdd,
          ownerRemove: allowEvent.ownerRemove,
        },
      })

      const changes: string[] = []
      if (args.mode) changes.push(`mode=${args.mode}`)
      if (args.maxPerTxUsd !== undefined) changes.push(`maxPerTxUsd=${args.maxPerTxUsd}`)
      if (args.maxPerDayUsd !== undefined) changes.push(`maxPerDayUsd=${args.maxPerDayUsd}`)
      if (args.integration && args.integrationEnabled !== undefined)
        changes.push(`integration.${args.integration}.enabled=${args.integrationEnabled}`)
      if (args.integration && args.integrationExecEnabled !== undefined)
        changes.push(`integration.${args.integration}.execEnabled=${args.integrationExecEnabled}`)
      if (args.integration && args.integrationPayEnabled !== undefined)
        changes.push(`integration.${args.integration}.payEnabled=${args.integrationPayEnabled}`)
      if (args.ownerAdd) changes.push(`ownerAdd=${args.ownerAdd}`)
      if (args.ownerRemove) changes.push(`ownerRemove=${args.ownerRemove}`)

      return {
        text: `✅ policy updated for account=${args.accountId} by ${actorUserId}\n- ${changes.join('\n- ')}`,
      }
    },
  })
}

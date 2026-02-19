import type { OpenClawConfig } from 'openclaw/plugin-sdk'
import { DEFAULT_ACCOUNT_ID } from './accounts.js'

export type TownsPolicyMode = 'READ_ONLY' | 'CONFIRM_ALWAYS' | 'BOUNDED_AUTO'

export type TownsPolicySnapshot = {
  accountId: string
  mode: TownsPolicyMode
  ownerUserIds: string[]
  limits: {
    maxPerTxUsd: number | null
    maxPerDayUsd: number | null
  }
  integrations: {
    polymarketEnabled: boolean
    registry8004Enabled: boolean
    x402Enabled: boolean
  }
}

type RawPolicy = {
  mode?: string
  allowedOwnerUserIds?: string[]
  limits?: {
    maxPerTxUsd?: number
    maxPerDayUsd?: number
  }
  integrations?: Record<string, { enabled?: boolean }>
}

function toMode(mode?: string): TownsPolicyMode {
  const m = String(mode ?? 'READ_ONLY').toUpperCase()
  if (m === 'CONFIRM_ALWAYS' || m === 'BOUNDED_AUTO') return m
  return 'READ_ONLY'
}

export function getPolicySnapshot(cfg: OpenClawConfig, accountId?: string): TownsPolicySnapshot {
  const aid = accountId ?? DEFAULT_ACCOUNT_ID
  const towns = (cfg.channels?.towns as { policy?: RawPolicy; accounts?: Record<string, { policy?: RawPolicy }> } | undefined)
  const policy = towns?.accounts?.[aid]?.policy ?? towns?.policy ?? {}

  return {
    accountId: aid,
    mode: toMode(policy.mode),
    ownerUserIds: policy.allowedOwnerUserIds ?? [],
    limits: {
      maxPerTxUsd: typeof policy.limits?.maxPerTxUsd === 'number' ? policy.limits.maxPerTxUsd : null,
      maxPerDayUsd: typeof policy.limits?.maxPerDayUsd === 'number' ? policy.limits.maxPerDayUsd : null,
    },
    integrations: {
      polymarketEnabled: policy.integrations?.polymarket?.enabled !== false,
      registry8004Enabled: policy.integrations?.registry8004?.enabled !== false,
      x402Enabled: policy.integrations?.x402?.enabled !== false,
    },
  }
}

export function isOwnerUser(cfg: OpenClawConfig, userId: string, accountId?: string): boolean {
  const policy = getPolicySnapshot(cfg, accountId)
  return policy.ownerUserIds.includes(userId)
}

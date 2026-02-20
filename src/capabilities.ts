import type { OpenClawConfig } from 'openclaw/plugin-sdk'
import { DEFAULT_ACCOUNT_ID, resolveTownsAccount } from './accounts.js'

export type CapabilitySnapshot = {
  accountId: string
  channelEnabled: boolean
  configured: boolean
  walletContext: boolean
  canSign: boolean
  policyMode: 'READ_ONLY' | 'CONFIRM_ALWAYS' | 'BOUNDED_AUTO'
  ownerCount: number
  webhookPath: string
  integrations: {
    polymarket: { ready: boolean; execEnabled: boolean }
    registry8004: { ready: boolean }
    x402: { ready: boolean; payEnabled: boolean }
  }
}

type TownsPolicy = {
  mode?: string
  allowedOwnerUserIds?: string[]
  integrations?: Record<string, { enabled?: boolean; execEnabled?: boolean; payEnabled?: boolean }>
}

function normalizeWebhookPath(accountId: string, webhookPath?: string): string {
  const configured = (webhookPath ?? '').trim()
  if (!configured) return `/towns/${accountId}/webhook`
  return configured.startsWith('/') ? configured : `/${configured}`
}

function getPolicy(cfg: OpenClawConfig, accountId: string): TownsPolicy {
  const towns = (cfg.channels?.towns as { policy?: TownsPolicy; accounts?: Record<string, { policy?: TownsPolicy }> } | undefined)
  const accountPolicy = towns?.accounts?.[accountId]?.policy
  return accountPolicy ?? towns?.policy ?? {}
}

export function getCapabilitySnapshot(cfg: OpenClawConfig, accountId?: string): CapabilitySnapshot {
  const aid = accountId ?? DEFAULT_ACCOUNT_ID
  const account = resolveTownsAccount({ cfg, accountId: aid })
  const policy = getPolicy(cfg, aid)

  const modeRaw = String(policy.mode ?? 'READ_ONLY').toUpperCase()
  const policyMode: CapabilitySnapshot['policyMode'] =
    modeRaw === 'CONFIRM_ALWAYS' || modeRaw === 'BOUNDED_AUTO' ? (modeRaw as CapabilitySnapshot['policyMode']) : 'READ_ONLY'

  const owners = policy.allowedOwnerUserIds ?? []
  const walletContext = account.configured
  const canSign = walletContext && policyMode !== 'READ_ONLY'

  const integrations = policy.integrations ?? {}

  return {
    accountId: aid,
    channelEnabled: account.enabled,
    configured: account.configured,
    walletContext,
    canSign,
    policyMode,
    ownerCount: owners.length,
    webhookPath: normalizeWebhookPath(aid, account.webhookPath),
    integrations: {
      polymarket: {
        ready: integrations.polymarket?.enabled !== false,
        execEnabled: canSign && (integrations.polymarket?.execEnabled ?? false),
      },
      registry8004: {
        ready: integrations.registry8004?.enabled !== false,
      },
      x402: {
        ready: integrations.x402?.enabled !== false,
        payEnabled: canSign && (integrations.x402?.payEnabled ?? false),
      },
    },
  }
}

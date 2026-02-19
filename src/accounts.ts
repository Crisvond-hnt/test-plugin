import type { OpenClawConfig } from 'openclaw/plugin-sdk'

export const DEFAULT_ACCOUNT_ID = 'default'

export type TownsAccountConfig = {
  enabled?: boolean
  name?: string
  appPrivateData?: string
  jwtSecret?: string
  allowFrom?: string[]
  webhookPath?: string
}

export type ResolvedTownsAccount = {
  accountId: string
  enabled: boolean
  configured: boolean
  name?: string
  appPrivateData?: string
  jwtSecret?: string
  allowFrom: string[]
  webhookPath?: string
}

function getChannel(cfg: OpenClawConfig): {
  enabled?: boolean
  appPrivateData?: string
  jwtSecret?: string
  allowFrom?: string[]
  webhookPath?: string
  accounts?: Record<string, TownsAccountConfig>
} {
  return (cfg.channels?.towns as {
    enabled?: boolean
    appPrivateData?: string
    jwtSecret?: string
    allowFrom?: string[]
    webhookPath?: string
    accounts?: Record<string, TownsAccountConfig>
  }) ?? {}
}

export function listTownsAccountIds(cfg: OpenClawConfig): string[] {
  const channel = getChannel(cfg)
  const accounts = channel.accounts ?? {}
  const keys = Object.keys(accounts)
  return keys.length > 0 ? keys : [DEFAULT_ACCOUNT_ID]
}

export function resolveTownsAccount(params: {
  cfg: OpenClawConfig
  accountId?: string
}): ResolvedTownsAccount {
  const channel = getChannel(params.cfg)
  const accountId = params.accountId ?? DEFAULT_ACCOUNT_ID
  const account = channel.accounts?.[accountId]

  const appPrivateData = account?.appPrivateData ?? channel.appPrivateData
  const jwtSecret = account?.jwtSecret ?? channel.jwtSecret
  const allowFrom = account?.allowFrom ?? channel.allowFrom ?? []
  const webhookPath = account?.webhookPath ?? channel.webhookPath

  return {
    accountId,
    enabled: account?.enabled ?? channel.enabled ?? true,
    configured: Boolean(appPrivateData && jwtSecret),
    name: account?.name,
    appPrivateData,
    jwtSecret,
    allowFrom,
    webhookPath,
  }
}

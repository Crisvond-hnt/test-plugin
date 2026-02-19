type TownsAgentFactory = (appPrivateData: string, jwtSecret: string, options: { commands: unknown[] }) => Promise<TownsAgentInstance>
import {
  createReplyPrefixOptions,
  emptyPluginConfigSchema,
  missingTargetError,
  type ChannelPlugin,
} from 'openclaw/plugin-sdk'
import type { OpenClawConfig } from 'openclaw/plugin-sdk'
import {
  DEFAULT_ACCOUNT_ID,
  listTownsAccountIds,
  resolveTownsAccount,
  type ResolvedTownsAccount,
} from './accounts.js'
import { registerTownsWebhookTarget } from './monitor.js'
import { getTownsRuntime } from './runtime.js'

type TownsAgentInstance = {
  agentUserId?: string
  onMessage: (cb: (handler: { sendMessage: (to: string, text: string) => Promise<unknown> }, event: any) => Promise<void> | void) => void
  sendMessage: (to: string, text: string) => Promise<{ eventId?: string } | unknown>
  start: () => { fetch: (req: Request) => Promise<Response> | Response }
}

const activeAgents = new Map<string, TownsAgentInstance>()
const activeWebhookUnregister = new Map<string, () => void>()

function looksLikeTownsStreamId(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  return /^0x[a-fA-F0-9]{40,}$/.test(trimmed) || trimmed.includes('/')
}

function resolveDefaultTarget(cfg: OpenClawConfig, accountId: string): string | undefined {
  const account = resolveTownsAccount({ cfg, accountId })
  return account.allowFrom.find((v) => String(v).trim().length > 0)
}

function resolveWebhookPath(account: ResolvedTownsAccount): string {
  const configured = account.webhookPath?.trim()
  if (configured) return configured.startsWith('/') ? configured : `/${configured}`
  return `/towns/${account.accountId}/webhook`
}

async function loadTownsAgentFactory(): Promise<TownsAgentFactory> {
  try {
    const mod = (await import('@towns-labs/agent')) as {
      makeTownsAgent?: TownsAgentFactory
    }
    if (typeof mod.makeTownsAgent !== 'function') {
      throw new Error('module does not export makeTownsAgent')
    }
    return mod.makeTownsAgent
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Towns SDK missing. Install dependencies in packages/openclaw-towns-plugin (npm install). Original error: ${message}`,
    )
  }
}

function attachInboundHandler(params: {
  agent: TownsAgentInstance
  account: ResolvedTownsAccount
  cfg: OpenClawConfig
}) {
  const { agent, account, cfg } = params
  const core = getTownsRuntime()

  agent.onMessage(async (handler, event) => {
    if (!event.message?.trim()) return
    if (String(event.userId).toLowerCase() === String(agent.agentUserId).toLowerCase()) return

    const route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: 'towns',
      accountId: account.accountId,
      peer: {
        kind: event.isDm ? 'direct' : 'group',
        id: event.channelId,
      },
    })

    const storePath = core.channel.session.resolveStorePath(cfg.session?.store, {
      agentId: route.agentId,
    })
    const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg)
    const previousTimestamp = core.channel.session.readSessionUpdatedAt({
      storePath,
      sessionKey: route.sessionKey,
    })

    const body = core.channel.reply.formatAgentEnvelope({
      channel: 'Towns',
      from: event.isDm ? `user:${event.userId}` : `channel:${event.channelId}`,
      timestamp: event.createdAt?.getTime?.(),
      previousTimestamp,
      envelope: envelopeOptions,
      body: event.message,
    })

    const ctxPayload = core.channel.reply.finalizeInboundContext({
      Body: body,
      RawBody: event.message,
      CommandBody: event.message,
      From: `towns:${event.userId}`,
      To: `towns:${event.channelId}`,
      SessionKey: route.sessionKey,
      AccountId: route.accountId,
      ChatType: event.isDm ? 'direct' : 'group',
      ConversationLabel: event.isDm ? `user:${event.userId}` : `channel:${event.channelId}`,
      SenderId: String(event.userId),
      Provider: 'towns',
      Surface: 'towns',
      MessageSid: event.eventId,
      ReplyToId: event.replyId,
      OriginatingChannel: 'towns',
      OriginatingTo: `towns:${event.channelId}`,
    })

    await core.channel.session.recordInboundSession({
      storePath,
      sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
      ctx: ctxPayload,
      onRecordError: () => {},
    })

    const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
      cfg,
      agentId: route.agentId,
      channel: 'towns',
      accountId: account.accountId,
    })

    await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg,
      dispatcherOptions: {
        ...prefixOptions,
        deliver: async (payload: { text?: string }) => {
          const text = (payload.text ?? '').trim()
          if (!text) return
          await handler.sendMessage(event.channelId, text)
        },
        onError: () => {},
      },
      replyOptions: {
        onModelSelected,
      },
    })
  })
}

export const townsPlugin: ChannelPlugin<ResolvedTownsAccount> = {
  id: 'towns',
  meta: {
    id: 'towns',
    label: 'Towns',
    selectionLabel: 'Towns',
    docsPath: '/channels/towns',
    docsLabel: 'towns',
    blurb: 'Towns Protocol channel plugin (MVP outbound)',
    order: 120,
  },
  capabilities: {
    chatTypes: ['direct', 'group'],
    media: false,
  },
  reload: { configPrefixes: ['channels.towns'] },
  configSchema: emptyPluginConfigSchema() as any,
  config: {
    listAccountIds: (cfg) => listTownsAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveTownsAccount({ cfg, accountId }),
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      resolveTownsAccount({ cfg, accountId }).allowFrom.map((v) => String(v)),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom.map((v) => String(v).trim()).filter(Boolean),
  },
  messaging: {
    normalizeTarget: (target) => target.trim(),
    targetResolver: {
      looksLikeId: (input) => looksLikeTownsStreamId(input),
      hint: '<streamId>',
    },
  },
  outbound: {
    deliveryMode: 'direct',
    textChunkLimit: 3500,
    resolveTarget: ({ cfg, to, accountId, mode }) => {
      const trimmed = to?.trim()
      if (trimmed) return { ok: true, to: trimmed }

      const fallback = resolveDefaultTarget(cfg, accountId ?? DEFAULT_ACCOUNT_ID)
      if (fallback) return { ok: true, to: fallback }

      if (mode === 'implicit' || mode === 'heartbeat') {
        return {
          ok: false,
          error: missingTargetError('Towns', '<streamId> or channels.towns.allowFrom[0]'),
        }
      }

      return {
        ok: false,
        error: missingTargetError('Towns', '<streamId> or channels.towns.allowFrom[0]'),
      }
    },
    sendText: async ({ to, text, accountId }) => {
      const aid = accountId ?? DEFAULT_ACCOUNT_ID
      const agent = activeAgents.get(aid)
      if (!agent) throw new Error(`Towns agent not running for account ${aid}`)
      const result = await agent.sendMessage(to, text ?? '')
      return {
        channel: 'towns',
        chatId: to,
        messageId: String((result as { eventId?: string } | undefined)?.eventId ?? ''),
      }
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: (accounts) =>
      accounts.flatMap((entry) => {
        if (entry.enabled !== false && entry.configured !== true) {
          return [
            {
              channel: 'towns',
              accountId: String(entry.accountId ?? DEFAULT_ACCOUNT_ID),
              kind: 'config' as const,
              message:
                'Towns account missing appPrivateData or jwtSecret (recommended: channels.towns.accounts.<accountId>.appPrivateData/jwtSecret).',
            },
          ]
        }
        return []
      }),
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
    }),
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account
      if (!account.configured || !account.appPrivateData || !account.jwtSecret) {
        throw new Error('Towns account is not configured (appPrivateData/jwtSecret missing)')
      }

      const makeTownsAgent = await loadTownsAgentFactory()
      const agent = await makeTownsAgent(account.appPrivateData, account.jwtSecret, {
        commands: [],
      })

      attachInboundHandler({ agent, account, cfg: ctx.cfg })

      const app = agent.start() as { fetch: (req: Request) => Promise<Response> | Response }
      const webhookPath = resolveWebhookPath(account)
      console.info(`[towns] starting account=${account.accountId} webhookPath=${webhookPath}`)
      const unregisterWebhook = registerTownsWebhookTarget({ path: webhookPath, app })

      activeAgents.set(account.accountId, agent)
      activeWebhookUnregister.set(account.accountId, unregisterWebhook)

      ctx.setStatus({
        accountId: account.accountId,
        running: true,
        lastStartAt: Date.now(),
        webhookPath,
      })

      return () => {
        activeAgents.delete(account.accountId)
        activeWebhookUnregister.get(account.accountId)?.()
        activeWebhookUnregister.delete(account.accountId)
        ctx.setStatus({
          accountId: account.accountId,
          running: false,
          lastStopAt: Date.now(),
        })
      }
    },
  },
}

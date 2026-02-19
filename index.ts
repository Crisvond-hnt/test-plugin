import type { OpenClawPluginApi } from 'openclaw/plugin-sdk'
import { townsPlugin } from './src/channel.js'
import { registerConnectTownsCommand } from './src/connect-command.js'
import { handleTownsWebhookRequest } from './src/monitor.js'
import { setTownsRuntime } from './src/runtime.js'
import { registerTownsHealthCommand } from './src/health-command.js'
import { registerCapabilitiesCommand } from './src/capabilities-command.js'
import { registerPolicyStatusCommand } from './src/policy-status-command.js'
import { registerPolicySetCommand } from './src/policy-set-command.js'

const pluginConfigSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    channels: {
      type: 'object',
      additionalProperties: true,
      properties: {
        towns: {
          type: 'object',
          additionalProperties: true,
          properties: {
            enabled: { type: 'boolean' },
            appPrivateData: { type: 'string', minLength: 1 },
            jwtSecret: { type: 'string', minLength: 1 },
            webhookPath: { type: 'string', minLength: 1 },
            allowFrom: {
              type: 'array',
              items: { type: 'string' },
            },
            accounts: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  enabled: { type: 'boolean' },
                  name: { type: 'string' },
                  appPrivateData: { type: 'string', minLength: 1 },
                  jwtSecret: { type: 'string', minLength: 1 },
                  webhookPath: { type: 'string', minLength: 1 },
                  allowFrom: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    plugins: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const

const plugin = {
  id: 'openclaw-towns-plugin',
  name: 'Towns',
  description: 'Towns channel plugin (MVP)',
  configSchema: pluginConfigSchema,
  register(api: OpenClawPluginApi) {
    setTownsRuntime(api.runtime)
    api.registerChannel({ plugin: townsPlugin })
    api.registerHttpHandler(handleTownsWebhookRequest)
    registerConnectTownsCommand(api)
    registerTownsHealthCommand(api)
    registerCapabilitiesCommand(api)
    registerPolicyStatusCommand(api)
    registerPolicySetCommand(api)
  },
}

export default plugin

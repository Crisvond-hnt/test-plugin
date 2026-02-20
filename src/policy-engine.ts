import type { CapabilitySnapshot } from './capabilities.js'

export type PolicyActionKind = 'read' | 'executeTx' | 'pay' | 'delegate'

export type PolicyDecision = {
  allow: boolean
  reasonCode:
    | 'ALLOW'
    | 'DENY_NOT_CONFIGURED'
    | 'DENY_READ_ONLY_MODE'
    | 'DENY_WALLET_CONTEXT_MISSING'
    | 'DENY_INTEGRATION_DISABLED'
}

export function evaluatePolicyAction(input: {
  capability: CapabilitySnapshot
  kind: PolicyActionKind
  integration?: 'polymarket' | 'registry8004' | 'x402'
}): PolicyDecision {
  const { capability, kind, integration } = input

  if (kind === 'read') return { allow: true, reasonCode: 'ALLOW' }

  if (!capability.configured) {
    return { allow: false, reasonCode: 'DENY_NOT_CONFIGURED' }
  }

  if (!capability.walletContext) {
    return { allow: false, reasonCode: 'DENY_WALLET_CONTEXT_MISSING' }
  }

  if (capability.policyMode === 'READ_ONLY') {
    return { allow: false, reasonCode: 'DENY_READ_ONLY_MODE' }
  }

  if (integration === 'polymarket' && !capability.integrations.polymarket.ready) {
    return { allow: false, reasonCode: 'DENY_INTEGRATION_DISABLED' }
  }

  if (integration === 'x402' && !capability.integrations.x402.ready) {
    return { allow: false, reasonCode: 'DENY_INTEGRATION_DISABLED' }
  }

  return { allow: true, reasonCode: 'ALLOW' }
}

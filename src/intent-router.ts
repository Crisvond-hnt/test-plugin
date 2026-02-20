export type ParsedIntent = {
  intent:
    | 'policy_set_limits'
    | 'policy_set_mode'
    | 'policy_toggle_integration'
    | 'approval_phrase'
    | 'capabilities_query'
    | 'unknown'
  params: Record<string, string | number | boolean>
  confidence: number
}

export function parseIntent(message: string): ParsedIntent {
  const text = message.trim().toLowerCase()

  if (/(max|limit).*(per tx|per transaction)/i.test(text)) {
    return { intent: 'policy_set_limits', params: {}, confidence: 0.7 }
  }

  if (/read[_ -]?only|confirm[_ -]?always|bounded[_ -]?auto/i.test(text)) {
    return { intent: 'policy_set_mode', params: {}, confidence: 0.7 }
  }

  if (/enable|disable/.test(text) && /(polymarket|x402|8004|registry)/.test(text)) {
    return { intent: 'policy_toggle_integration', params: {}, confidence: 0.75 }
  }

  if (/approve\s+tx|reject\s+tx/i.test(text)) {
    return { intent: 'approval_phrase', params: {}, confidence: 0.95 }
  }

  if (/what can you do|capabilities|status/i.test(text)) {
    return { intent: 'capabilities_query', params: {}, confidence: 0.65 }
  }

  return { intent: 'unknown', params: {}, confidence: 0.1 }
}

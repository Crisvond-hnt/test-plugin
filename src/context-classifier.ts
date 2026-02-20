export type TrustContextKind = 'owner_dm' | 'owner_group' | 'shared_group' | 'agent_room' | 'unknown'

export type TrustContext = {
  kind: TrustContextKind
  ownerPresent: boolean
  participantCount?: number
}

export function classifyTrustContext(input: {
  isDm?: boolean
  ownerPresent?: boolean
  participantsAreAgentsOnly?: boolean
  participantCount?: number
}): TrustContext {
  const isDm = input.isDm === true
  const ownerPresent = input.ownerPresent === true
  const agentsOnly = input.participantsAreAgentsOnly === true

  if (agentsOnly) return { kind: 'agent_room', ownerPresent, participantCount: input.participantCount }
  if (isDm && ownerPresent) return { kind: 'owner_dm', ownerPresent, participantCount: input.participantCount }
  if (!isDm && ownerPresent) return { kind: 'owner_group', ownerPresent, participantCount: input.participantCount }
  if (!isDm) return { kind: 'shared_group', ownerPresent, participantCount: input.participantCount }
  return { kind: 'unknown', ownerPresent, participantCount: input.participantCount }
}

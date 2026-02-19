export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'

export type ApprovalRequest = {
  id: string
  nonce: string
  accountId: string
  action: string
  requestedBy: string
  payloadHash: string
  createdAt: number
  expiresAt: number
  status: ApprovalStatus
}

const approvals = new Map<string, ApprovalRequest>()

function makeId(): string {
  return `apr_${Math.random().toString(36).slice(2, 10)}`
}

function makeNonce(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase()
}

export function createApprovalRequest(input: {
  accountId: string
  action: string
  requestedBy: string
  payloadHash: string
  ttlMs?: number
}): ApprovalRequest {
  const now = Date.now()
  const req: ApprovalRequest = {
    id: makeId(),
    nonce: makeNonce(),
    accountId: input.accountId,
    action: input.action,
    requestedBy: input.requestedBy,
    payloadHash: input.payloadHash,
    createdAt: now,
    expiresAt: now + (input.ttlMs ?? 10 * 60 * 1000),
    status: 'PENDING',
  }
  approvals.set(req.id, req)
  return req
}

export function getApprovalRequest(id: string): ApprovalRequest | undefined {
  const req = approvals.get(id)
  if (!req) return undefined
  if (req.status === 'PENDING' && req.expiresAt <= Date.now()) {
    req.status = 'EXPIRED'
    approvals.set(req.id, req)
  }
  return req
}

export function listApprovals(limit = 20): ApprovalRequest[] {
  const items = [...approvals.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)

  return items.map((item) => {
    if (item.status === 'PENDING' && item.expiresAt <= Date.now()) {
      return { ...item, status: 'EXPIRED' as const }
    }
    return item
  })
}

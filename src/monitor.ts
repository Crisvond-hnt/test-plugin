import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

type TownsWebhookTarget = {
  path: string
  app: { fetch: (req: Request) => Promise<Response> | Response }
}

const targets = new Map<string, TownsWebhookTarget>()

function normalizePath(raw: string): string {
  const t = raw.trim()
  if (!t) return '/'
  const withSlash = t.startsWith('/') ? t : `/${t}`
  if (withSlash.length > 1 && withSlash.endsWith('/')) return withSlash.slice(0, -1)
  return withSlash
}

export function registerTownsWebhookTarget(target: TownsWebhookTarget): () => void {
  const path = normalizePath(target.path)
  if (targets.has(path)) {
    throw new Error(`Duplicate Towns webhook path registration: ${path}`)
  }

  const normalized: TownsWebhookTarget = { ...target, path }
  targets.set(path, normalized)

  return () => {
    targets.delete(path)
  }
}

function headersFromReq(req: IncomingMessage): Headers {
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue
    if (Array.isArray(v)) {
      for (const vv of v) headers.append(k, vv)
    } else {
      headers.set(k, v)
    }
  }
  return headers
}

async function proxyToHonoApp(
  req: IncomingMessage,
  res: ServerResponse,
  target: TownsWebhookTarget,
): Promise<void> {
  const baseUrl = new URL(req.url ?? '/', 'http://localhost')
  // Towns agent webhook handler expects /webhook
  const requestUrl = new URL('/webhook', baseUrl)

  const bodyAllowed = req.method !== 'GET' && req.method !== 'HEAD'
  const request = new Request(requestUrl.toString(), {
    method: req.method ?? 'POST',
    headers: headersFromReq(req),
    body: bodyAllowed ? (Readable.toWeb(req) as ReadableStream<Uint8Array>) : undefined,
    duplex: bodyAllowed ? 'half' : undefined,
  } as RequestInit)

  const response = await target.app.fetch(request)

  if (response.status === 401) {
    console.warn(
      `[towns] webhook auth rejected (401) at path=${target.path}. Check appPrivateData/jwtSecret and ensure webhook registration app address matches appPrivateData identity.`,
    )
  }

  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  const arrayBuffer = await response.arrayBuffer()
  res.end(Buffer.from(arrayBuffer))
}

export async function handleTownsWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = normalizePath(url.pathname)
  const target = targets.get(path)
  if (!target) return false

  if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'POST')
    res.end('Method Not Allowed')
    return true
  }

  try {
    await proxyToHonoApp(req, res, target)
  } catch (error) {
    console.error(`[towns] webhook proxy error path=${path}:`, error)
    if (!res.headersSent) {
      res.statusCode = 502
      res.end('Bad Gateway')
    }
  }
  return true
}

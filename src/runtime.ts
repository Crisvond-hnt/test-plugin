import type { OpenClawPluginApi } from 'openclaw/plugin-sdk'

type Runtime = OpenClawPluginApi['runtime']

let runtime: Runtime | null = null

export function setTownsRuntime(value: Runtime) {
  runtime = value
}

export function getTownsRuntime(): Runtime {
  if (!runtime) throw new Error('Towns runtime not initialized')
  return runtime
}

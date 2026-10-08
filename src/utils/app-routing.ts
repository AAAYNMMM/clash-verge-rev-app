import type { AppMatcher, AppTarget } from '@/types/app-routing'
import type { ProxyNodeView, ProxyViewV1 } from '@/types/proxy-view'

export const parseLines = (text: string) => [
  ...new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  ),
]

export const parseApplications = (text: string): AppMatcher[] =>
  parseLines(text).map((line) => {
    const value =
      line.startsWith('"') && line.endsWith('"') ? line.slice(1, -1) : line
    return { kind: /[/\\]/.test(value) ? 'path' : 'name', value }
  })

export const nodeTarget = (node: ProxyNodeView): AppTarget => ({
  kind: 'node',
  name: node.source.proxyName,
  provider: node.source.kind === 'provider' ? node.source.providerName : null,
})

export const targetKey = (target: AppTarget): string =>
  target.kind === 'node'
    ? JSON.stringify(['node', target.provider ?? null, target.name])
    : target.kind

const BUILTIN_TYPES = new Set([
  'direct',
  'reject',
  'rejectdrop',
  'reject-drop',
  'pass',
  'pass-rule',
  'compatible',
  'dns',
  'rematch',
])

export const appNodes = (view: ProxyViewV1 | undefined): ProxyNodeView[] => {
  const unique = new Map<string, ProxyNodeView>()
  for (const node of Object.values(view?.records ?? {})) {
    if (!BUILTIN_TYPES.has(node.type.toLowerCase())) {
      unique.set(targetKey(nodeTarget(node)), node)
    }
  }
  return [...unique.values()]
}

export const findAppNode = (nodes: ProxyNodeView[], target: AppTarget) =>
  target.kind === 'node'
    ? nodes.find((node) => targetKey(nodeTarget(node)) === targetKey(target))
    : undefined

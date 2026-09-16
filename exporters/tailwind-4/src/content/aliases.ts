import { Token, TokenGroup, TokenType } from "@supernovaio/sdk-exporters"
import { tokenVariableName, isExcludedByPath, isExcludedByProperty } from "./token"

const SEMANTIC_GROUPS = ["Background", "Text", "Border", "Foreground"] as const
type SemanticGroup = typeof SEMANTIC_GROUPS[number]

type UtilityBinding = { utility: string; property: string }

const UTILITY_MAP: Record<Lowercase<SemanticGroup>, UtilityBinding[]> = {
  background: [{ utility: "bg", property: "background-color" }],
  text: [{ utility: "text", property: "color" }],
  border: [
    { utility: "border", property: "border-color" },
    { utility: "ring", property: "--tw-ring-color" },
    { utility: "outline", property: "outline-color" }
  ],
  foreground: [
    { utility: "fill", property: "fill" },
    { utility: "stroke", property: "stroke" }
  ]
}

function semanticGroupOf(token: Token): Lowercase<SemanticGroup> | null {
  const path = token.tokenPath || []
  if (path.length < 2 || path[0].toLowerCase() !== "color") return null
  const group = path[1]
  const match = SEMANTIC_GROUPS.find(g => g.toLowerCase() === group.toLowerCase())
  return match ? (match.toLowerCase() as Lowercase<SemanticGroup>) : null
}

function shortNameFor(token: Token, tokenGroups: Array<TokenGroup>, group: string): string | null {
  const full = tokenVariableName(token, tokenGroups)
  const prefix = `color-${group}-`
  if (!full.startsWith(prefix)) return null
  return full.slice(prefix.length)
}

export function generateAliases(tokens: Array<Token>, tokenGroups: Array<TokenGroup>): string {
  const colorTokens = tokens.filter(t => t.tokenType === TokenType.color && !isExcludedByPath(t) && !isExcludedByProperty(t))

  const collisions = new Map<string, string[]>()
  const lines: string[] = []

  for (const token of colorTokens) {
    const group = semanticGroupOf(token)
    if (!group) continue

    const shortName = shortNameFor(token, tokenGroups, group)
    if (!shortName) continue

    const cssVarName = `--color-${group}-${shortName}`
    const bindings = UTILITY_MAP[group]

    for (const { utility, property } of bindings) {
      const utilName = `${utility}-${shortName}`
      const key = utility
      const existing = collisions.get(key) || []
      if (existing.includes(shortName)) {
        continue
      }
      existing.push(shortName)
      collisions.set(key, existing)
      lines.push(`@utility ${utilName} { ${property}: var(${cssVarName}); }`)
    }
  }

  return lines.join("\n") + (lines.length ? "\n" : "")
}

export function detectAliasCollisions(tokens: Array<Token>, tokenGroups: Array<TokenGroup>): string[] {
  const seen = new Map<string, string>()
  const errors: string[] = []

  const colorTokens = tokens.filter(t => t.tokenType === TokenType.color && !isExcludedByPath(t) && !isExcludedByProperty(t))

  for (const token of colorTokens) {
    const group = semanticGroupOf(token)
    if (!group) continue
    const shortName = shortNameFor(token, tokenGroups, group)
    if (!shortName) continue

    for (const { utility } of UTILITY_MAP[group]) {
      const key = `${utility}-${shortName}`
      const previous = seen.get(key)
      const originPath = [...(token.tokenPath || []), token.name].join("/")
      if (previous && previous !== originPath) {
        errors.push(`Duplicate alias "${key}" — declared by both "${previous}" and "${originPath}"`)
      } else {
        seen.set(key, originPath)
      }
    }
  }

  return errors
}

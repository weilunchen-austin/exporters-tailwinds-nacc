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
  // Foreground maps to fill only — this DS uses Material Icons, which are fill-based
  // shapes (even Outlined style is a filled shape with a hole), never stroked paths.
  foreground: [
    { utility: "fill", property: "fill" }
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

// Header name shown for each utility bucket. `bg`/`text` reuse the semantic group name so
// the header reads meaningfully; the rest are named after the utility itself so multi-binding
// semantics (Border → border/ring/outline, Foreground → fill/stroke) split into their own
// sections rather than being interleaved under one heading.
const UTILITY_SECTION_HEADER: Record<string, string> = {
  bg: "Background",
  text: "Text",
  border: "Border",
  ring: "Ring",
  outline: "Outline",
  fill: "Fill",
  stroke: "Stroke"
}

export function generateAliases(tokens: Array<Token>, tokenGroups: Array<TokenGroup>): string {
  const colorTokens = tokens.filter(t => t.tokenType === TokenType.color && !isExcludedByPath(t) && !isExcludedByProperty(t))

  const collisions = new Map<string, string[]>()
  // Bucket @utility lines by utility name (bg, text, fill, stroke, border, ring, outline) so
  // each utility type gets its own header. Map preserves insertion order — buckets appear in
  // the order their first line was emitted, which reflects Supernova's sortOrder.
  const bucketsByUtility = new Map<string, string[]>()

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

      let bucket = bucketsByUtility.get(utility)
      if (!bucket) {
        bucket = []
        bucketsByUtility.set(utility, bucket)
      }
      bucket.push(`@utility ${utilName} { ${property}: var(${cssVarName}); }`)
    }
  }

  if (bucketsByUtility.size === 0) return ""

  const sections: string[] = []
  bucketsByUtility.forEach((lines, utility) => {
    if (lines.length === 0) return
    const header = UTILITY_SECTION_HEADER[utility] ?? (utility.charAt(0).toUpperCase() + utility.slice(1))
    // Sort within each bucket so variants of the same base (bg-primary, bg-primary-active,
    // bg-primary-hover, ...) cluster together — Supernova's sortOrder tends to scatter them.
    const sortedLines = [...lines].sort((a, b) => a.localeCompare(b))
    sections.push(`/* ${header} */\n${sortedLines.join("\n")}`)
  })

  return sections.join("\n\n") + "\n"
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

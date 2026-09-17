import { NamingHelper, CSSHelper, GeneralHelper, StringCase } from "@supernovaio/export-utils"
import { Token, TokenGroup, TokenType, TypographyTokenValue, FontSizeTokenValue, LineHeightTokenValue, LetterSpacingTokenValue, FontWeightTokenValue, TypographyToken, AnyDimensionTokenValue, AnyTokenValue, AnyToken } from "@supernovaio/sdk-exporters"
import { exportConfiguration } from ".."
import { FindReplaceTiming } from "../../config"
import { TAILWIND_TOKEN_PREFIXES, TAILWIND_ALLOWED_CUSTOMIZATION, TAILWIND_STRIP_GROUP_TYPES, TAILWIND_GROUP_OVERRIDES, TAILWIND_ROOT_SCOPED_TYPES, GroupOverride } from "../constants/defaults"
import { ColorHelper } from "@supernovaio/export-utils"
import { ColorFormat } from "@supernovaio/export-utils"

/**
 * Gets the prefix for a specific token type based on configuration.
 * Uses either custom prefixes from configuration or default prefixes.
 * @param tokenType - The type of token (e.g., color, typography, etc.)
 * @returns The prefix string to use for this token type
 */
export function getTokenPrefix(tokenType: TokenType): string {
  return TAILWIND_TOKEN_PREFIXES[tokenType]
}

/**
 * Check if a token type is allowed for customization in Tailwind
 * @param tokenType The token type to check
 * @returns True if the token type is allowed in Tailwind customization
 */
export function isAllowedTokenType(tokenType: TokenType): boolean {
  return TAILWIND_ALLOWED_CUSTOMIZATION.includes(tokenType)
}

/**
 * Looks up a group override for a token, matching a Figma group segment (from the token's
 * path or its parent-group hierarchy) against the type's override table. Used for the Size
 * collection, where different Figma groups need different Tailwind namespaces + CSS scopes
 * per design guidelines §2.3.
 *
 * Returns both the override and the original (cased) group name — the caller uses the name
 * for section headers and for reconstructing the variable name.
 */
export function getGroupOverride(
  token: Token,
  tokenGroups: Array<TokenGroup>
): { override: GroupOverride; groupName: string } | null {
  const typeOverrides = TAILWIND_GROUP_OVERRIDES[token.tokenType]
  if (!typeOverrides) return null

  const path = token.tokenPath || []
  for (const segment of path) {
    const override = typeOverrides[segment.toLowerCase()]
    if (override) return { override, groupName: segment }
  }

  const parent = tokenGroups.find((g) => g.id === token.parentGroupId)
  if (parent) {
    const parentPath = (parent as unknown as { path?: string[] }).path || []
    for (const segment of [...parentPath, parent.name]) {
      const override = typeOverrides[segment.toLowerCase()]
      if (override) return { override, groupName: segment }
    }
  }

  return null
}

/**
 * Returns the target scope (theme vs root) for a token. Root-scoped types (BorderWidth per
 * §2.4) always go to `:root`. Otherwise, a group override may override the default `theme`
 * scope. Falls back to `"theme"` for the base @theme inline block.
 */
export function getTokenScope(
  token: Token,
  tokenGroups: Array<TokenGroup>
): "theme" | "root" {
  if (TAILWIND_ROOT_SCOPED_TYPES.includes(token.tokenType)) return "root"
  const overrideMatch = getGroupOverride(token, tokenGroups)
  if (overrideMatch) return overrideMatch.override.scope
  return "theme"
}

const SEMANTIC_GROUPS = ["background", "text", "border", "foreground"] as const
type SemanticGroup = typeof SEMANTIC_GROUPS[number]

const BRIDGE_PREFIX: Record<SemanticGroup, string> = {
  background: "bg",
  text: "text",
  border: "border",
  foreground: "fill"
}

export function getSemanticGroup(token: Token): SemanticGroup | null {
  const path = token.tokenPath || []
  if (path.length < 2 || path[0].toLowerCase() !== "color") return null
  const group = path[1].toLowerCase()
  return (SEMANTIC_GROUPS as readonly string[]).includes(group) ? (group as SemanticGroup) : null
}

export function getBridgeVarName(token: Token, tokenGroups: Array<TokenGroup>): string | null {
  const group = getSemanticGroup(token)
  if (!group) return null
  const full = tokenVariableName(token, tokenGroups)
  const semanticPrefix = `color-${group}-`
  if (!full.startsWith(semanticPrefix)) return null
  return `${BRIDGE_PREFIX[group]}-${full.slice(semanticPrefix.length)}`
}

// Excludes tokens whose top-level path segment matches the configured list (e.g. "UxTools,Nav").
// Falls back to the same default as config.json when Pulsar hasn't materialized the config value
// — the local CLI and some pipeline runs skip options that pre-date the pipeline's saved settings.
export function isExcludedByPath(token: Token): boolean {
  const raw = exportConfiguration.excludedTokenPathSegments ?? "UxTools,Nav"
  if (!raw) return false
  const excluded = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (excluded.length === 0) return false
  const path = token.tokenPath || []
  if (path.length === 0) return false
  return excluded.includes(path[0].toLowerCase())
}

// Excludes tokens flagged by a Supernova custom property (defaults to the boolean `internal`
// column). Tolerates boolean, number, or string ("yes"/"true"/"1") shapes so it works whether
// the DS team models the flag as a boolean, select, or text property.
// Falls back to codeName "internal" when Pulsar hasn't materialized the config value — the
// local CLI and some pipeline runs skip options that pre-date the pipeline's saved settings.
export function isExcludedByProperty(token: Token): boolean {
  const configured = exportConfiguration.excludeByPropertyName
  const codeName = (typeof configured === "string" ? configured.trim() : "") || "internal"
  if (!codeName) return false
  const value = token.propertyValues?.[codeName]
  if (value === undefined || value === null) return false
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value > 0
  const v = String(value).trim().toLowerCase()
  return v === "true" || v === "yes" || v === "1"
}

/**
 * Generates debug information for a token
 * @param token - The token to generate debug info for
 * @param indentString - The indentation string to use
 * @returns Debug information string or empty string if debug is disabled
 */
function generateDebugInfo(token: Token, indentString: string): string {
  if (!exportConfiguration.debug) {
    return ""
  }

  const tokenPath = token.tokenPath || []
  const fullPath = [...tokenPath, token.name].join('/')
  
  return `${indentString}/* Path: ${fullPath} */\n` +
         `${indentString}/* Token: ${JSON.stringify({
           name: token.name,
           id: token.id,
           type: token.tokenType,
           path: token.tokenPath,
           prefix: getTokenPrefix(token.tokenType),
           value: (token as unknown as AnyToken).value
         })} */\n`
}

/**
 * Handles the conversion of a typography token into CSS custom properties
 * @param token - The typography token to convert
 * @param mappedTokens - Map of all tokens for resolving references
 * @param tokenGroups - Array of token groups for determining token hierarchy
 * @returns Formatted CSS custom property string
 */
function handleTypographyToken(token: Token, mappedTokens: Map<string, Token>, tokenGroups: Array<TokenGroup>): string {
  const indentString = GeneralHelper.indent(exportConfiguration.indent)
  let output = ""
  
  // Add debug info
  output += generateDebugInfo(token, indentString)

  // Add description if enabled
  if (exportConfiguration.showDescriptions && token.description) {
    output += `${indentString}/* ${token.description.trim()} */\n`
  }

  // Get the base name for the typography token
  const baseName = tokenVariableName(token, tokenGroups)

  // Extract individual properties from the typography token
  // @ts-ignore
  const typographyValue = token.value as TypographyTokenValue

  // Helper function to create CSS variable for a typography property
  const createTypographyProperty = (property: keyof Omit<TypographyTokenValue, 'referencedTokenId'>, suffix: string = '') => {
    if (typographyValue[property]) {
      const propertyValue = typographyValue[property] as AnyDimensionTokenValue
      const value = {
        ...propertyValue,
        referencedTokenId: propertyValue.referencedTokenId || null
      }

      // Map typography properties to their corresponding token types
      const tokenTypeMap: Record<keyof Omit<TypographyTokenValue, 'referencedTokenId'>, TokenType> = {
        fontSize: TokenType.fontSize,
        lineHeight: TokenType.lineHeight,
        letterSpacing: TokenType.letterSpacing,
        fontWeight: TokenType.fontWeight,
        fontFamily: TokenType.fontFamily,
        textDecoration: TokenType.textDecoration,
        textCase: TokenType.textCase,
        paragraphIndent: TokenType.paragraphSpacing,
        paragraphSpacing: TokenType.paragraphSpacing
      }

      // @ts-ignore
      output += `${indentString}--${baseName}${suffix}: ${CSSHelper.tokenToCSS({ ...token, value, tokenType: tokenTypeMap[property] }, mappedTokens, {
        allowReferences: exportConfiguration.useReferences,
        decimals: exportConfiguration.colorPrecision,
        colorFormat: exportConfiguration.colorFormat,
        forceRemUnit: exportConfiguration.forceRemUnit,
        remBase: exportConfiguration.remBase,
        tokenToVariableRef: (t) => `var(--${tokenVariableName(t, tokenGroups)})`
      })};\n`
    }
  }

  // Create CSS variables for each typography property
  createTypographyProperty('fontSize') // Base font size
  createTypographyProperty('lineHeight', '--line-height')
  createTypographyProperty('letterSpacing', '--letter-spacing')
  createTypographyProperty('fontWeight', '--font-weight')

  return output
}

/**
 * Converts a design token into its CSS custom property representation.
 * Handles formatting of the token value, references, and optional description comments.
 * 
 * @param token - The design token to convert
 * @param mappedTokens - Map of all tokens for resolving references
 * @param tokenGroups - Array of token groups for determining token hierarchy
 * @returns Formatted CSS custom property string with optional description comment or null if token type is not allowed
 */
export function convertedToken(token: Token, mappedTokens: Map<string, Token>, tokenGroups: Array<TokenGroup>, colorTokensNeedingOklch?: Set<string>, themePath?: string): string | null {
  // Skip tokens that are not allowed for Tailwind customization
  if (!isAllowedTokenType(token.tokenType)) {
    return null;
  }

  // Special handling for typography tokens
  if (token.tokenType === TokenType.typography) {
    return handleTypographyToken(token, mappedTokens, tokenGroups)
  }

  // Bridge-var pattern for semantic colors (see design guidelines §6).
  // - In the BASE file (no themePath): emit `--color-background-primary: var(--bg-primary);`
  //   so Tailwind's `@theme inline` inlines the bridge reference into every auto-generated utility.
  // - In THEME files (themePath set): emit `--bg-primary: <themed value>;` under the theme selector.
  const bridge = getBridgeVarName(token, tokenGroups)
  if (bridge) {
    const indentString = GeneralHelper.indent(exportConfiguration.indent)
    let out = ""
    if (exportConfiguration.showDescriptions && token.description) {
      out += `${indentString}/* ${token.description.trim()} */\n`
    }
    if (themePath) {
      const value = CSSHelper.tokenToCSS(token, mappedTokens, {
        allowReferences: exportConfiguration.useReferences,
        decimals: exportConfiguration.colorPrecision,
        colorFormat: exportConfiguration.colorFormat,
        forceRemUnit: exportConfiguration.forceRemUnit,
        remBase: exportConfiguration.remBase,
        tokenToVariableRef: (t) => `var(--${tokenVariableName(t, tokenGroups)})`
      })
      out += `${indentString}--${bridge}: ${value};`
    } else {
      const semanticName = tokenVariableName(token, tokenGroups)
      out += `${indentString}--${semanticName}: var(--${bridge});`
    }
    return out
  }

  // Generate the CSS variable name based on token properties and configuration
  let name = tokenVariableName(token, tokenGroups)

  // Convert token value to CSS, handling references and formatting according to configuration
  const value = CSSHelper.tokenToCSS(token, mappedTokens, {
    allowReferences: exportConfiguration.useReferences,
    decimals: exportConfiguration.colorPrecision,
    colorFormat: exportConfiguration.colorFormat,
    forceRemUnit: exportConfiguration.forceRemUnit,
    remBase: exportConfiguration.remBase,
    // Custom handler for token references - converts them to CSS var() syntax
    tokenToVariableRef: (t, context) => {
      // Skip references to tokens that are not allowed for Tailwind customization
      if (!isAllowedTokenType(t.tokenType)) {
        // Return the raw value instead of a reference
        return CSSHelper.tokenToCSS(t, mappedTokens, {
          allowReferences: false, // Don't follow nested references
          decimals: exportConfiguration.colorPrecision,
          colorFormat: exportConfiguration.colorFormat,
          forceRemUnit: exportConfiguration.forceRemUnit,
          remBase: exportConfiguration.remBase,
          tokenToVariableRef: () => "", // Stub function that never gets called since allowReferences is false
          valueTransformer: undefined
        });
      }
      // If context requests a channel-based color variable (needsRgb), use the oklch utility variable in this exporter
      if (context?.needsRgb && t.tokenType === TokenType.color && colorTokensNeedingOklch?.has(t.id)) {
        return `var(--oklch-${tokenVariableName(t, tokenGroups)})`
      }
      return `var(--${tokenVariableName(t, tokenGroups)})`
    },
    // Handle blur values - extract just the dimension
    valueTransformer: (value: string, t: Token) => {
      if (t.tokenType === TokenType.blur) {
        // For blur(12px) -> extract 12px
        const match = value.match(/^blur\((.*)\)$/)
        if (match) {
          return match[1]
        }
        // For direct values (background blur) just return as is
        return value
      }
      if (t.tokenType === TokenType.shadow) {
        // The SDK emits `rgba(var(--color-<name>), <alpha>)` for shadow color references,
        // which is invalid CSS: the var expands to a hex string, not a `r, g, b` triple.
        // In this DS the referenced color already carries the intended alpha in its own
        // hex (e.g. `#262c2c1f` = 12%), so drop the wrapper and use the reference directly.
        // The Supernova shadow layer's opacity is redundant with the color's baked-in alpha.
        return value.replace(/rgba\(var\(--([^)]+)\),\s*[\d.]+\)/g, "var(--$1)")
      }
      return undefined
    }
  })
  const indentString = GeneralHelper.indent(exportConfiguration.indent)

  let output = ""
  
  // Add debug info
  output += generateDebugInfo(token, indentString)

  // Add description if enabled
  if (exportConfiguration.showDescriptions && token.description) {
    output += `${indentString}/* ${token.description.trim()} */\n`
  }

  // Special handling for blur tokens
  if (token.tokenType === TokenType.blur) {
    const tokenPath = token.tokenPath || []
    const fullPath = [...tokenPath, token.name].join('/').toLowerCase()
    const isBackdropBlur = fullPath.includes('background')
    const blurName = isBackdropBlur ? 'backdrop-blur' : (token.name.toLowerCase() === 'blur' ? 'blur-default' : `blur-${token.name}`)
    name = NamingHelper.codeSafeVariableName(blurName, StringCase.kebabCase)
  }
  
  output += `${indentString}--${name}: ${value};`
  return output
}

/**
 * Normalizes a name for Tailwind usage by ensuring it has at least one hyphen
 * by appending "-default" if it's a single word, so it doesn't result in a class name like ".text", ".text-color", ".border", etc.
 * @param name The name to normalize
 * @returns The normalized name with "-default" appended if it was a single word
 */
function normalizeForTailwindConfig(name: string): string {
    if (!name.includes('-') 
      || name === "text-color" 
      || name === "background-color" 
      || name === "border-color"
      || name === "box-shadow-color"
      || name === "outline-color"
      || name === "stroke-color"
      || name === "fill-color"
      || name === "ring-color"
      ) {
        return `${name}-default`;
    }
    return name;
}

/**
 * Applies find/replace patterns to a variable name. Used when find/replace timing is set to "afterPrefix".
 * Supports patterns with or without leading "--" (e.g., both "--spacing" and "spacing" will work).
 * @param name The variable name to apply replacements to (without leading --)
 * @param findReplace Record of find/replace patterns
 * @returns The name with all replacements applied
 */
function applyFindReplace(name: string, findReplace?: Record<string, string>): string {
  if (!findReplace || Object.keys(findReplace).length === 0) return name;
  
  // Add -- prefix to match how CSS variables appear, so users can use patterns like "--spacing"
  let result = `--${name}`;
  
  // Sort find patterns by length (longest first) to handle overlapping patterns
  const sortedPatterns = Object.entries(findReplace)
    .sort(([a], [b]) => b.length - a.length)
  
  for (const [find, replace] of sortedPatterns) {
    result = result.split(find).join(replace)
  }
  
  // Remove leading -- that we added (it will be added back when generating CSS)
  result = result.replace(/^--/, '')
  
  // Clean up any double hyphens or leading/trailing hyphens that might result from replacements
  result = result.replace(/-+/g, '-').replace(/^-|-$/g, '')
  
  return result;
}

/**
 * Checks if a token path matches a color utility pattern, considering both positive and negative patterns.
 * @param fullPath The full token path to check
 * @param patternString The pattern string containing comma-separated patterns, with optional ! prefix for negation
 * @returns An object containing whether the path matches and the first matching positive pattern
 */
function matchColorUtilityPattern(fullPath: string, patternString: string): { matches: boolean; matchingPattern: string } {
  // Split pattern by comma to support multiple patterns for a single utility
  const patterns = patternString.split(',').map(p => p.trim().toLowerCase())
  
  // Separate positive and negative patterns
  const positivePatterns = patterns.filter(p => !p.startsWith('!'))
  const negativePatterns = patterns.filter(p => p.startsWith('!')).map(p => p.slice(1))
  
  // Check if the path matches any positive pattern
  const matchesPositive = positivePatterns.some(pattern => fullPath.includes(pattern))
  
  // Check if the path matches any negative pattern
  const matchesNegative = negativePatterns.some(pattern => fullPath.includes(pattern))
  
  // A match occurs if it matches at least one positive pattern AND doesn't match any negative patterns
  const matches = matchesPositive && !matchesNegative
  
  // Find the first matching positive pattern
  const matchingPattern = matches ? (positivePatterns.find(pattern => fullPath.includes(pattern)) || '') : ''
  
  return { matches, matchingPattern }
}

/**
 * Generates a code-safe variable name for a token based on its properties and configuration.
 * Includes type-specific prefix and considers token hierarchy.
 * 
 * @param token - The token to generate a name for
 * @param tokenGroups - Array of token groups for determining token hierarchy
 * @returns Formatted variable name string
 */
export function tokenVariableName(token: Token, tokenGroups: Array<TokenGroup>): string {
  let prefix = getTokenPrefix(token.tokenType)
  
  // Determine if find/replace should be applied before prefix (passed to NamingHelper)
  // or after prefix (applied manually to the final name)
  const applyFindReplaceBeforePrefix = exportConfiguration.findReplaceTiming !== FindReplaceTiming.AfterPrefix
  const findReplaceForNamingHelper = applyFindReplaceBeforePrefix ? exportConfiguration.findReplace : undefined
  
  // Handle color utility prefixes if enabled and token is a color
  if (exportConfiguration.useColorUtilityPrefixes && token.tokenType === TokenType.color) {
    // Get the parent once and reuse it
    const parent = tokenGroups.find((group) => group.id === token.parentGroupId)
    
    // Use the token's built-in path and add token name
    const tokenPath = token.tokenPath || []
    const fullPath = [...tokenPath, token.name].join('/').toLowerCase()

    // Check token path against each utility pattern
    for (const [utilityName, patternString] of Object.entries(exportConfiguration.colorUtilityPrefixes)) {
      const { matches, matchingPattern } = matchColorUtilityPattern(fullPath, patternString)
      
      if (matches) {
        const patternIndex = tokenPath.findIndex(p => p.toLowerCase().includes(matchingPattern))
        
        // Get the remaining path segments after the pattern match
        const remainingPath = patternIndex >= 0 
          ? tokenPath.slice(patternIndex + 1)
          : tokenPath

        // Combine remaining path with token name
        const segments = [...remainingPath, token.name]
        const cleanName = segments.join('-').toLowerCase()
          .trim()
          .replace(/^[-\s]+|[-\s]+$/g, '') // Remove leading/trailing hyphens and spaces

        // Construct the name as: utility-color-path-name
        // We also remove the utility name from the cleanName to avoid redundancy
        let name = NamingHelper.codeSafeVariableName(`${utilityName}-color-${cleanName.replace(utilityName, '')}`, StringCase.kebabCase, findReplaceForNamingHelper, true)

        name = normalizeForTailwindConfig(name);
        
        // Apply find/replace after prefix if timing is set to afterPrefix
        if (!applyFindReplaceBeforePrefix) {
          name = applyFindReplace(name, exportConfiguration.findReplace)
        }
        
        return name;
      }
    }

    // If no utility match, use standard naming
    let name = NamingHelper.codeSafeVariableNameForToken(token, StringCase.kebabCase, parent || null, prefix, findReplaceForNamingHelper)
    name = normalizeForTailwindConfig(name);
    
    // Apply find/replace after prefix if timing is set to afterPrefix
    if (!applyFindReplaceBeforePrefix) {
      name = applyFindReplace(name, exportConfiguration.findReplace)
    }
    
    return name;
  }

  // For non-color tokens or when color utility prefixes are disabled
  const parent = tokenGroups.find((group) => group.id === token.parentGroupId)

  // Per-group override (Size collection routing, §2.3). Replaces the type prefix with the
  // group's own namespace, and drops the group segment when it would duplicate the namespace
  // (Breakpoint/Icon/Viewport). For Width the segment stays, yielding `--container-width-md`.
  const overrideMatch = getGroupOverride(token, tokenGroups)
  if (overrideMatch) {
    prefix = overrideMatch.override.namespace
    const effectiveParent = overrideMatch.override.keepGroupSegment ? (parent || null) : null
    let name = NamingHelper.codeSafeVariableNameForToken(token, StringCase.kebabCase, effectiveParent, prefix, findReplaceForNamingHelper)
    name = normalizeForTailwindConfig(name)
    if (!applyFindReplaceBeforePrefix) {
      name = applyFindReplace(name, exportConfiguration.findReplace)
    }
    return name
  }

  // For token types whose Figma group name duplicates the Tailwind namespace (FontSize, LineHeight,
  // FontWeight, FontFamily, BorderRadius), drop the parent so we get e.g. `--text-md` instead of
  // `--text-font-size-md`. See design guidelines §2.2.
  const effectiveParent = TAILWIND_STRIP_GROUP_TYPES.includes(token.tokenType) ? null : (parent || null)
  let name = NamingHelper.codeSafeVariableNameForToken(token, StringCase.kebabCase, effectiveParent, prefix, findReplaceForNamingHelper)
  name = normalizeForTailwindConfig(name);

  // Drop the "elevation" segment from shadow names — Tailwind's own `shadow-*` prefix already
  // conveys elevation, so `--shadow-elevation-form-action` reads as noise. Keeps the parent
  // group (Form, Surface) intact so `--shadow-form-action` still carries semantic clarity.
  if (token.tokenType === TokenType.shadow) {
    name = name.replace(/(^|-)elevation-/g, "$1")
  }

  // Apply find/replace after prefix if timing is set to afterPrefix
  if (!applyFindReplaceBeforePrefix) {
    name = applyFindReplace(name, exportConfiguration.findReplace)
  }

  return name;
}

/**
 * Analyzes tokens to identify which color tokens need OKLCH utility variables.
 * A color token needs an OKLCH utility if it's referenced by shadow, border, or gradient tokens
 * that have custom opacity values.
 * 
 * @param tokens - Array of all tokens
 * @param tokenGroups - Array of token groups for determining token hierarchy
 * @returns Set of color token IDs that need OKLCH utility versions
 */
export function analyzeTokensForOklchUtilities(
  tokens: Array<Token>,
  tokenGroups: Array<TokenGroup>
): Set<string> {
  const colorTokensNeedingOklch = new Set<string>()
  const mappedTokens = new Map(tokens.map((token) => [token.id, token]))

  tokens.forEach((token) => {
    if (token.tokenType === TokenType.shadow) {
      const shadowToken = token as any
      shadowToken.value.forEach((shadowLayer: any) => {
        if (shadowLayer.opacity && shadowLayer.color.referencedTokenId) {
          const referencedColorToken = mappedTokens.get(shadowLayer.color.referencedTokenId)
          if (referencedColorToken && referencedColorToken.tokenType === TokenType.color) {
            colorTokensNeedingOklch.add(referencedColorToken.id)
          }
        }
      })
    } else if (token.tokenType === TokenType.border) {
      const borderToken = token as any
      if (borderToken.value.opacity && borderToken.value.color.referencedTokenId) {
        const referencedColorToken = mappedTokens.get(borderToken.value.color.referencedTokenId)
        if (referencedColorToken && referencedColorToken.tokenType === TokenType.color) {
          colorTokensNeedingOklch.add(referencedColorToken.id)
        }
      }
    } else if (token.tokenType === TokenType.gradient) {
      const gradientToken = token as any
      gradientToken.value.forEach((gradientLayer: any) => {
        gradientLayer.stops.forEach((stop: any) => {
          if (stop.opacity && stop.color.referencedTokenId) {
            const referencedColorToken = mappedTokens.get(stop.color.referencedTokenId)
            if (referencedColorToken && referencedColorToken.tokenType === TokenType.color) {
              colorTokensNeedingOklch.add(referencedColorToken.id)
            }
          }
        })
      })
    }
  })

  return colorTokensNeedingOklch
}

/**
 * Gets the OKLCH value (L C H, no alpha) for a color token.
 * @param token - The color token
 * @returns OKLCH value string (e.g., "0.627 0.15 29.23")
 */
export function getColorTokenOklchValue(token: Token): string {
  if (token.tokenType !== TokenType.color) {
    throw new Error(`Expected color token, got ${token.tokenType}`)
  }
  const colorValue = (token as any).value
  // Use ColorHelper to get oklch values
  // ColorHelper.colorToOklch expects (format, color, alpha, decimals)
  // We'll use ColorFormat.oklch, and only want the L C H part
  // ColorHelper.colorToOklch returns a string like "oklch(0.627% 0.15 29.23)"
  // We'll extract the values inside the parentheses
  const oklchString = ColorHelper.colorToOklch(
    ColorFormat.oklch,
    { r: Math.round(colorValue.color.r), g: Math.round(colorValue.color.g), b: Math.round(colorValue.color.b) },
    colorValue.opacity.measure,
    3
  )
  // Extract the part inside "oklch(...)"
  const match = oklchString.match(/oklch\(([^)]+)\)/)
  if (match) {
    return match[1].replace(/%/g, '').trim()
  }
  return ''
}

/**
 * Generates an OKLCH utility variable for a color token.
 * This creates a CSS variable containing only the OKLCH values (no alpha) for use with custom opacity.
 * 
 * @param token - The color token to generate OKLCH utility for
 * @param tokenGroups - Array of token groups for determining token hierarchy
 * @returns Formatted CSS custom property string for the OKLCH utility variable
 */
export function generateOklchUtilityVariable(
  token: Token,
  tokenGroups: Array<TokenGroup>
): string {
  const name = tokenVariableName(token, tokenGroups)
  const oklchName = `oklch-${name}`
  const oklchValue = getColorTokenOklchValue(token)
  const indentString = GeneralHelper.indent(exportConfiguration.indent)
  if (exportConfiguration.showDescriptions && token.description) {
    return `${indentString}/* OKLCH utility for ${token.description.trim()} */\n${indentString}--${oklchName}: ${oklchValue};`
  } else {
    return `${indentString}--${oklchName}: ${oklchValue};`
  }
}

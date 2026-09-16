import { Token, TokenGroup, TokenType } from "@supernovaio/sdk-exporters"
import { CSSHelper, GeneralHelper } from "@supernovaio/export-utils"
import { exportConfiguration } from ".."
import { tokenVariableName, isExcludedByPath, getSemanticGroup, getBridgeVarName } from "./token"

export { getSemanticGroup, getBridgeVarName }

export function filterSemanticColorTokens(tokens: Array<Token>): Array<Token> {
  return tokens.filter(t =>
    t.tokenType === TokenType.color &&
    !isExcludedByPath(t) &&
    getSemanticGroup(t) !== null
  )
}

/**
 * Emit `--bg-primary: var(--color-...);` bridge declarations for the given semantic tokens.
 * Values reference the underlying primitive (via useReferences) so themes flip cleanly.
 * Currently unused by the main emission path (convertedToken handles the bridge inline for
 * themed files), but kept for external callers and future use cases.
 */
export function generateBridgeDeclarations(
  tokens: Array<Token>,
  mappedTokens: Map<string, Token>,
  tokenGroups: Array<TokenGroup>
): string {
  const indent = GeneralHelper.indent(exportConfiguration.indent)
  const semantic = filterSemanticColorTokens(tokens)
  const lines: string[] = []

  for (const token of semantic) {
    const bridge = getBridgeVarName(token, tokenGroups)
    if (!bridge) continue

    const value = CSSHelper.tokenToCSS(token, mappedTokens, {
      allowReferences: exportConfiguration.useReferences,
      decimals: exportConfiguration.colorPrecision,
      colorFormat: exportConfiguration.colorFormat,
      forceRemUnit: exportConfiguration.forceRemUnit,
      remBase: exportConfiguration.remBase,
      tokenToVariableRef: (t) => `var(--${tokenVariableName(t, tokenGroups)})`
    })

    if (exportConfiguration.showDescriptions && token.description) {
      lines.push(`${indent}/* ${token.description.trim()} */`)
    }
    lines.push(`${indent}--${bridge}: ${value};`)
  }

  return lines.join("\n")
}

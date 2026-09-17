import { TokenType } from "@supernovaio/sdk-exporters"

export const TAILWIND_TOKEN_PREFIXES: Record<TokenType, string> = {
  Color: "color",
  Typography: "text",
  Dimension: "spacing",
  Size: "spacing",
  Space: "spacing",
  Opacity: "opacity",
  FontSize: "text",
  LineHeight: "leading",
  LetterSpacing: "tracking",
  ParagraphSpacing: "paragraph",
  BorderWidth: "border",
  BorderRadius: "radius",
  Duration: "duration",
  ZIndex: "z",
  Shadow: "shadow",
  Border: "border",
  Gradient: "gradient",
  String: "string",
  ProductCopy: "product-copy",
  FontFamily: "font",
  FontWeight: "font-weight",
  TextCase: "text-case",
  TextDecoration: "text-decoration",
  Visibility: "visibility",
  Blur: "blur"
} 

/**
 * List of token types that can be customized in Tailwind 4
 * These are the token types supported by Tailwind CSS configuration
 * 
 * Unsupported token types that will be filtered out:
 * - Dimension (use size or space instead)
 * - ParagraphSpacing (not directly supported by Tailwind)
 * - Gradient (not a core Tailwind property)
 * - String (not relevant for CSS variables)
 * - ProductCopy (not relevant for CSS variables)
 * - TextCase (use Tailwind text-case utilities instead)
 * - TextDecoration (use Tailwind text-decoration utilities instead)
 * - Visibility (use Tailwind visibility utilities instead)
 */
/**
 * Token types where the Figma group name duplicates the Tailwind namespace prefix.
 * For these, the parent group is dropped when building variable names so
 * `--text-font-size-md` becomes `--text-md`, `--radius-border-radius-md` becomes
 * `--radius-md`, etc. See §2.2 of the design token guidelines.
 */
export const TAILWIND_STRIP_GROUP_TYPES: TokenType[] = [
  TokenType.fontSize,
  TokenType.lineHeight,
  TokenType.fontWeight,
  TokenType.fontFamily,
  TokenType.radius
]

/**
 * Namespace and scope override for tokens whose Figma group requires a different Tailwind
 * treatment than the token type's default. See design guidelines §2.3.
 *
 * `namespace`         — replaces the type's default variable prefix.
 * `scope`             — `"theme"` for `@theme inline { ... }`, `"root"` for plain `:root { ... }`.
 * `keepGroupSegment`  — when true, the Figma group name stays in the variable
 *                       (e.g. `Width/md` → `--container-width-md`). When false, it is dropped
 *                       (e.g. `Breakpoint/md` → `--breakpoint-md`).
 * `utility`           — optional extra emission. `"square"` produces
 *                       `@utility <name> { width: var(--<name>); height: var(--<name>); }`.
 */
export type GroupOverride = {
  namespace: string
  scope: "theme" | "root"
  keepGroupSegment: boolean
  utility?: "square"
}

export const TAILWIND_GROUP_OVERRIDES: Partial<Record<TokenType, Record<string, GroupOverride>>> = {
  [TokenType.size]: {
    breakpoint: { namespace: "breakpoint", scope: "theme", keepGroupSegment: false },
    width:      { namespace: "container",  scope: "theme", keepGroupSegment: true },
    icon:       { namespace: "icon",       scope: "root",  keepGroupSegment: false, utility: "square" },
    viewport:   { namespace: "viewport",   scope: "root",  keepGroupSegment: false },
  },
}

/**
 * Token types whose variables are plain CSS custom properties (`:root { ... }`) rather than
 * Tailwind `@theme inline` entries. See design guidelines §2.4.
 */
export const TAILWIND_ROOT_SCOPED_TYPES: TokenType[] = [
  TokenType.borderWidth,
]

export const TAILWIND_ALLOWED_CUSTOMIZATION: TokenType[] = [
  TokenType.color,
  TokenType.space,
  TokenType.size,
  TokenType.fontSize,
  TokenType.lineHeight,
  TokenType.letterSpacing,
  TokenType.radius,
  TokenType.borderWidth,
  TokenType.fontFamily,
  TokenType.fontWeight,
  TokenType.shadow,
  TokenType.opacity,
  TokenType.duration,
  TokenType.zIndex,
  TokenType.blur,
  TokenType.typography,
  TokenType.border,
  TokenType.dimension
] 


export const DEFAULT_CONFIG_FILE_NAMES: Record<TokenType, string> = {
  Color: "tailwind.color.css",
  Typography: "tailwind.typography.css",
  Dimension: "tailwind.dimension.css",
  Size: "tailwind.size.css",
  Space: "tailwind.space.css",
  Opacity: "tailwind.opacity.css",
  FontSize: "tailwind.font-size.css",
  LineHeight: "tailwind.line-height.css",
  LetterSpacing: "tailwind.letter-spacing.css",
  ParagraphSpacing: "tailwind.paragraph-spacing.css",
  BorderWidth: "tailwind.border-width.css",
  BorderRadius: "tailwind.border-radius.css",
  Duration: "tailwind.duration.css",
  ZIndex: "tailwind.z-index.css",
  Shadow: "tailwind.shadow.css",
  Border: "tailwind.border.css",
  Gradient: "tailwind.gradient.css",
  String: "tailwind.string.css",
  ProductCopy: "tailwind.product-copy.css",
  FontFamily: "tailwind.font-family.css",
  FontWeight: "tailwind.font-weight.css",
  TextCase: "tailwind.text-case.css",
  TextDecoration: "tailwind.text-decoration.css",
  Visibility: "tailwind.visibility.css",
  Blur: "tailwind.blur.css"
}

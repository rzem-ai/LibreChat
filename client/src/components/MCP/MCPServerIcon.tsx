import { useIsDarkMode } from '~/hooks/MCP';
import { resolveThemedIconPaths, type ThemedIconPaths } from './mcpServerUtils';

// Deloitte Custom Change: light/dark themed MCP server icons.
interface MCPServerIconProps extends Partial<ThemedIconPaths> {
  alt: string;
  className?: string;
}

// Deloitte Custom Change: light/dark themed MCP server icons.
/**
 * Renders a per-server MCP icon, theme-aware when light/dark variants differ.
 * Returns null when no icon is configured, so callers can render their own fallback.
 */
export default function MCPServerIcon({
  iconPath,
  iconPathLight,
  iconPathDark,
  alt,
  className,
}: MCPServerIconProps) {
  const { light, dark } = resolveThemedIconPaths({ iconPath, iconPathLight, iconPathDark });
  const isDarkMode = useIsDarkMode();

  if (!light && !dark) {
    return null;
  }

  const src = isDarkMode ? (dark ?? light) : (light ?? dark);

  return <img src={src ?? undefined} alt={alt} className={className} />;
}

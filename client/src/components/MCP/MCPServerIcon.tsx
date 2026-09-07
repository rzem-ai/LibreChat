import { cn } from '~/utils';
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

  if (!light && !dark) {
    return null;
  }

  if (light === dark) {
    return <img src={light ?? undefined} alt={alt} className={className} />;
  }

  return (
    <>
      <img src={light ?? undefined} alt={alt} className={cn(className, 'dark:hidden')} />
      <img src={dark ?? undefined} alt={alt} className={cn(className, 'hidden dark:block')} />
    </>
  );
}

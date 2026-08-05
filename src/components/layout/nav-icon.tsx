import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavTone } from "@/lib/nav/structure";

/**
 * The nav's colour. The shell is Ink Neutral everywhere else — every hue in
 * the sidebar and the mobile bar comes through here, from the `--nav-*`
 * tokens, so a section's identity colour is defined in exactly one place.
 *
 * Three renderings, by role in the hierarchy:
 *   tile  — top-level rows. Tinted rounded tile, solid when the section is
 *           active. This is the "rich icon" the approved mockups showed.
 *   glyph — child rows. The parent's hue on the bare glyph, so children read
 *           as belonging to their section without competing with it.
 *   bare  — the compact mobile tab bar, where a tile would crowd the FAB.
 *
 * Tones resolve through inline custom properties rather than Tailwind classes
 * because the token is chosen at runtime; a `bg-nav-${tone}` class string
 * would not survive Tailwind's static scan.
 */
export function NavIcon({
  icon: Icon,
  tone,
  variant = "tile",
  active = false,
  className,
}: {
  icon: LucideIcon;
  tone: NavTone;
  variant?: "tile" | "glyph" | "bare";
  active?: boolean;
  className?: string;
}) {
  const toneVar = `var(--nav-${tone})`;

  if (variant === "tile") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
          className
        )}
        style={
          active
            ? { backgroundColor: toneVar, color: "var(--card)" }
            : {
                backgroundColor: `color-mix(in oklch, ${toneVar} 14%, transparent)`,
                color: toneVar,
              }
        }
      >
        <Icon className="size-4" />
      </span>
    );
  }

  return (
    <Icon
      aria-hidden="true"
      className={cn(
        "shrink-0",
        variant === "bare" ? "size-5" : "size-4",
        className
      )}
      style={{ color: active ? toneVar : `color-mix(in oklch, ${toneVar} 70%, transparent)` }}
    />
  );
}

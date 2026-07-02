"use client";

import { useCallback, useState } from "react";
import {
  isNavItemActive,
  type NavCategory,
  type NavSection,
} from "@/lib/nav/structure";

function sectionContainsActive(
  section: NavSection,
  pathname: string
): boolean {
  return section.items.some((item) => isNavItemActive(pathname, item));
}

/**
 * Open/closed state for collapsible tier-2 sections. Openness is derived:
 * a section is open when the user explicitly toggled it open this session,
 * or (absent a toggle) when it contains the active route. Pure derivation —
 * SSR and client agree, and navigating into a collapsed group auto-opens it.
 */
export function useCollapsibleSections(
  category: NavCategory,
  pathname: string
) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const isOpen = useCallback(
    (section: NavSection) => {
      if (!section.collapsible) return true;
      const override = overrides[`${category.labelKey}:${section.labelKey}`];
      if (override !== undefined) return override;
      return sectionContainsActive(section, pathname);
    },
    [overrides, category.labelKey, pathname]
  );

  const toggle = useCallback(
    (section: NavSection) => {
      setOverrides((prev) => {
        const key = `${category.labelKey}:${section.labelKey}`;
        const current =
          prev[key] !== undefined
            ? prev[key]
            : sectionContainsActive(section, pathname);
        return { ...prev, [key]: !current };
      });
    },
    [category.labelKey, pathname]
  );

  return { isOpen, toggle };
}

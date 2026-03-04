/**
 * FileIconThemeProvider - Wraps IconThemeProvider with convenience API.
 * Loads icon theme JSON (Seti format), maps file extensions/names to icon paths.
 */
import { type ParentProps, createEffect, on } from "solid-js";
import { useSettings } from "@/context/SettingsContext";
import {
  IconThemeProvider,
  useIconTheme,
  BUILTIN_THEMES,
} from "@/context/iconTheme/IconThemeProvider";
import type {
  IconDefinition,
  IconTheme,
  IconThemeState,
  IconThemeContextValue,
} from "@/context/iconTheme/types";

export { BUILTIN_THEMES };
export type { IconDefinition, IconTheme, IconThemeState, IconThemeContextValue };

export function getIconForFile(filename: string): IconDefinition {
  const ctx = useIconTheme();
  return ctx.getFileIcon(filename);
}

export function getIconForFolder(name: string, open: boolean): IconDefinition {
  const ctx = useIconTheme();
  return ctx.getFolderIcon(name, open);
}

function IconThemeSettingsSync() {
  const settings = useSettings();
  const iconTheme = useIconTheme();

  createEffect(
    on(
      () => ({
        settingsThemeId: settings.effectiveSettings().theme.iconTheme,
        availableThemeIds: iconTheme.themes().map((theme) => theme.id).join("|"),
      }),
      ({ settingsThemeId }) => {
        const activeThemeId = iconTheme.activeTheme().id;
        const normalizedSettingsThemeId =
          typeof settingsThemeId === "string" ? settingsThemeId.trim() : "";

        if (
          normalizedSettingsThemeId.length === 0 ||
          normalizedSettingsThemeId === "default"
        ) {
          const fallbackThemeId = "seti";
          if (activeThemeId !== fallbackThemeId) {
            iconTheme.setIconTheme(fallbackThemeId);
          }
          return;
        }

        const availableThemeIds = new Set(
          iconTheme.themes().map((theme) => theme.id),
        );
        if (!availableThemeIds.has(normalizedSettingsThemeId)) return;
        if (normalizedSettingsThemeId === activeThemeId) return;

        iconTheme.setIconTheme(normalizedSettingsThemeId);
      },
    ),
  );

  return null;
}

export function FileIconThemeProvider(props: ParentProps) {
  return (
    <IconThemeProvider>
      <IconThemeSettingsSync />
      {props.children}
    </IconThemeProvider>
  );
}

export { useIconTheme };

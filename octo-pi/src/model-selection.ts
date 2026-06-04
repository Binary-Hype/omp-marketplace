import type { ExtensionContext, Theme } from "@oh-my-pi/pi-coding-agent";
import type { Model } from "@oh-my-pi/pi-ai";
import { extractPrintableText, fuzzyFilter, matchesKey } from "@oh-my-pi/pi-tui";
import type { KeybindingsManager } from "@oh-my-pi/pi-tui";

export interface ModelItem {
  value: string;
  label: string;
  description?: string;
}

export function buildModelItems(models: Model[], currentModel?: Model): ModelItem[] {
  return models.map((m) => {
    const selector = `${m.provider}/${m.id}`;
    const isCurrent = currentModel && `${currentModel.provider}/${currentModel.id}` === selector;
    return {
      value: selector,
      label: `${m.name}${isCurrent ? " (orchestrator)" : ""}`,
      description: `${m.provider} — ctx ${m.contextWindow}`,
    };
  });
}

export async function multiSelectModels(
  items: ModelItem[],
  preselected: Set<string>,
  ctx: ExtensionContext,
): Promise<string[] | null> {
  if (!ctx.hasUI) {
    return null;
  }

  const selectedIndices = new Set<number>();
  items.forEach((item, i) => {
    if (preselected.has(item.value)) selectedIndices.add(i);
  });

  try {
    return await ctx.ui.custom<string[] | null>(
      (_tui, theme, _keybindings, done) => {
        let cursor = 0;
        let filter = "";
        const selected = new Set<number>(selectedIndices);
        function getFilteredIndices(): number[] {
          if (!filter.trim()) {
            return items.map((_, i) => i);
          }
          const filtered = fuzzyFilter(items, filter, (item) =>
            `${item.label} ${item.value} ${item.description ?? ""}`.trim(),
          );
          return filtered.map((item) => items.indexOf(item));
        }
        return {
          render(_width: number): string[] {
            const lines: string[] = [];
            lines.push(theme.bold("Select participant models (Space toggles, Enter confirms, Esc cancels, type to search)"));
            lines.push(theme.fg("dim", "  Orchestrator: current model (not auto-selected)"));
            lines.push("");
            if (filter) {
              lines.push(theme.fg("dim", `Search: ${filter}`));
            }
            const filteredIndices = getFilteredIndices();
            const maxVisible = Math.min(filteredIndices.length, 10);
            const start = Math.max(0, Math.min(cursor - maxVisible + 1, filteredIndices.length - maxVisible));
            const end = Math.min(filteredIndices.length, start + maxVisible);
            if (filteredIndices.length === 0) {
              lines.push(theme.fg("dim", "  No matches."));
            } else {
              for (let i = start; i < end; i++) {
                const originalIndex = filteredIndices[i];
                const item = items[originalIndex];
                const isCursor = i === cursor;
                const isSelected = selected.has(originalIndex);
                const prefix = isSelected ? "[x]" : "[ ]";
                const cursorMarker = isCursor ? ">" : " ";
                const label = `${cursorMarker} ${prefix} ${item.label}`;
                const desc = item.description ? theme.fg("dim", ` — ${item.description}`) : "";
                lines.push(label + desc);
              }
              if (filteredIndices.length > maxVisible) {
                lines.push(theme.fg("dim", `  (${start + 1}-${end} of ${filteredIndices.length})`));
              }
            }
            if (selected.size < 2) {
              lines.push("");
              lines.push(theme.fg("warning", "Select at least 2 models to proceed."));
            }
            return lines;
          },
          handleInput(key: string) {
            if (matchesKey(key, "up")) {
              const filteredIndices = getFilteredIndices();
              cursor = cursor > 0 ? cursor - 1 : filteredIndices.length - 1;
            } else if (matchesKey(key, "down")) {
              const filteredIndices = getFilteredIndices();
              cursor = cursor < filteredIndices.length - 1 ? cursor + 1 : 0;
            } else if (matchesKey(key, "space")) {
              const filteredIndices = getFilteredIndices();
              if (filteredIndices.length === 0) return;
              const originalIndex = filteredIndices[cursor];
              if (selected.has(originalIndex)) selected.delete(originalIndex);
              else selected.add(originalIndex);
            } else if (matchesKey(key, "enter") || matchesKey(key, "return") || key === "\n") {
              if (selected.size >= 2) {
                done(Array.from(selected).map((i) => items[i].value));
              }
            } else if (matchesKey(key, "backspace")) {
              if (filter.length > 0) {
                const chars = [...filter];
                chars.pop();
                filter = chars.join("");
                cursor = 0;
              }
            } else if (matchesKey(key, "escape") || matchesKey(key, "ctrl+c")) {
              done(null);
            } else {
              const printable = extractPrintableText(key);
              if (printable !== undefined) {
                filter += printable;
                cursor = 0;
              }
            }
          },
          invalidate() {},
        };
      },
    );
  } catch {
    return null;
  }
}

import type { AssistantMessage, TextContent } from "@oh-my-pi/pi-ai";

export function extractAssistantText(message: AssistantMessage): string {
  if (!message.content) return "";
  return message.content
    .filter((c): c is TextContent => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

export function formatModelLabel(selector: string): string {
  return selector.replace(/\//g, " / ");
}

export function truncateOutput(text: string, maxChars = 4000): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `\n\n... (${text.length - maxChars} characters truncated)`;
}

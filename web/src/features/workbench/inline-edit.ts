/** Build the chat prompt for a Cursor-style inline edit. */

export interface InlineSelection {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  text: string;
}

export const INLINE_MAX_INSTRUCTION = 4000;
export const INLINE_MAX_SELECTION_BYTES = 65_536;

export function inlineSelectionError(selection: InlineSelection, instruction: string): string | null {
  if (!instruction.trim()) return "Describe the change first.";
  if (instruction.length > INLINE_MAX_INSTRUCTION) {
    return `Instruction is longer than ${INLINE_MAX_INSTRUCTION} characters.`;
  }
  if (new TextEncoder().encode(selection.text).length > INLINE_MAX_SELECTION_BYTES) {
    return "Selection is too large; select fewer lines.";
  }
  return null;
}

function fenceFor(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const longest = runs.reduce((length, run) => Math.max(length, run.length), 0);
  return "`".repeat(Math.max(3, longest + 1));
}

export function buildInlinePrompt(input: {
  path: string;
  language: string;
  selection: InlineSelection;
  instruction: string;
}): string {
  const { path, language, selection } = input;
  const instruction = input.instruction.trim();
  const fence = fenceFor(selection.text);
  return [
    `Inline edit for ${path} (lines ${selection.startLine}-${selection.endLine}).`,
    `Instruction: ${instruction}`,
    "",
    "Selected code:",
    `${fence}${language}`,
    selection.text,
    fence,
    "",
    `Apply the change to ${path} now, scoped to the selected lines unless the instruction requires otherwise.`,
  ].join("\n");
}

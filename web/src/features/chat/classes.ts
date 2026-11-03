/**
 * Visual class contracts for the chat surface.
 *
 * Feature components own parsing, keyboard rules, streaming, and scroll
 * behavior; the skin that renders them supplies the concrete CSS-module class
 * names through these maps. Nothing in `features/` imports a skin, so a second
 * skin only has to provide its own map.
 */

export interface TranscriptClasses {
  message: string;
  messageStreaming: string;
  role: string;
  body: string;
  deferredPreview: string;
  muted: string;
  streamingCursor: string;
  markdown: string;
  codeBlock: string;
  image: string;
  imagePlaceholder: string;
  thinking: string;
  thinkingSummary: string;
  thinkingBody: string;
  thinkingMarkdown: string;
  thinkingLoading: string;
  thinkingError: string;
  toolCall: string;
  toolCallError: string;
  toolSummary: string;
  toolName: string;
  toolStatus: string;
  toolRunning: string;
  toolError: string;
  toolBody: string;
  toolArgs: string;
  toolOutput: string;
  toolResult: string;
  toolResultError: string;
  toolResultName: string;
  toolImages: string;
  toolPartial: string;
  toolPending: string;
  standaloneResult: string;
  execution: string;
  command: string;
  output: string;
  badge: string;
  badgeOk: string;
  badgeError: string;
  badgeMuted: string;
  textual: string;
  subdued: string;
  files: string;
  file: string;
}

export interface ComposerClasses {
  wrap: string;
  composer: string;
  composerDrop: string;
  input: string;
  footer: string;
  controls: string;
  stats: string;
  actions: string;
  send: string;
  stop: string;
  ghost: string;
  queue: string;
  hint: string;
  error: string;
}

export interface QueueClasses {
  panel: string;
  header: string;
  group: string;
  groupLabel: string;
  list: string;
  row: string;
  text: string;
  promote: string;
  remove: string;
}

export interface ModelPickerClasses {
  picker: string;
  pill: string;
  pillIcon: string;
  select: string;
  modelSelect: string;
  thinkingSelect: string;
  chevron: string;
}

export interface ExtensionDialogClasses {
  panel: string;
  header: string;
  title: string;
  method: string;
  form: string;
  message: string;
  options: string;
  option: string;
  optionBody: string;
  optionLabel: string;
  recommended: string;
  optionDescription: string;
  preview: string;
  questions: string;
  question: string;
  legend: string;
  questionHeader: string;
  questionText: string;
  input: string;
  promptEditor: string;
  error: string;
  footer: string;
  cancel: string;
  submit: string;
}

export interface RunningAgentsClasses {
  strip: string;
  row: string;
  icon: string;
  name: string;
  task: string;
  state: string;
  pulse: string;
  time: string;
  more: string;
}

export interface ChatClasses {
  transcript: TranscriptClasses;
  composer: ComposerClasses;
  queue: QueueClasses;
  modelPicker: ModelPickerClasses;
  extensionDialog: ExtensionDialogClasses;
  runningAgents: RunningAgentsClasses;
}

import { highlight } from "./highlight-engine";
self.onmessage = (
  event: MessageEvent<{
    text: string;
    kind: string;
    source: string;
    choice: string;
  }>,
) => {
  const { text, kind, source, choice } = event.data;
  try {
    self.postMessage(highlight(text, kind, source, choice));
  } catch {
    self.postMessage(null);
  }
};

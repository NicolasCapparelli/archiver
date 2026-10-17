import { extractText, type ExtractRequest } from "./text-extract.ts";
self.onmessage = (event: MessageEvent<ExtractRequest>) => {
  try { self.postMessage({ result: extractText(event.data) }); }
  catch (error) { self.postMessage({ error: String(error) }); }
};

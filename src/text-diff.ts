export type DiffLine = { kind: "same" | "add" | "remove"; text: string };
export function diffLines(
  before: string,
  after: string,
): { lines: DiffLine[]; coarse: boolean } {
  if (before.length > 100000 || after.length > 100000)
    throw new Error("Compare text up to 100,000 characters per item.");
  const a = before ? before.split(/(?<=\n)/) : [],
    b = after ? after.split(/(?<=\n)/) : [];
  const lines: DiffLine[] = [];
  const emit = (kind: DiffLine["kind"], text: string) =>
    lines.push({ kind, text });
  if (a.length * b.length > 250000) {
    let start = 0,
      end = 0;
    while (start < a.length && start < b.length && a[start] === b[start])
      start++;
    while (
      end < a.length - start &&
      end < b.length - start &&
      a[a.length - 1 - end] === b[b.length - 1 - end]
    )
      end++;
    a.slice(0, start).forEach((t) => emit("same", t));
    a.slice(start, a.length - end).forEach((t) => emit("remove", t));
    b.slice(start, b.length - end).forEach((t) => emit("add", t));
    a.slice(a.length - end).forEach((t) => emit("same", t));
    return { lines, coarse: true };
  }
  const width = b.length + 1,
    matrix = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      matrix[i * width + j] =
        a[i] === b[j]
          ? 1 + matrix[(i + 1) * width + j + 1]
          : Math.max(matrix[(i + 1) * width + j], matrix[i * width + j + 1]);
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      emit("same", a[i++]);
      j++;
    } else if (
      i < a.length &&
      (j === b.length ||
        matrix[(i + 1) * width + j] >= matrix[i * width + j + 1])
    )
      emit("remove", a[i++]);
    else emit("add", b[j++]);
  }
  return { lines, coarse: false };
}

/** Shared catalog-card identity. Adjacent role text supplies its accessible name. */
export function ArchiverMark({ size = 32 }: { size?: number }) {
  const micro = size < 32;
  return (
    <svg width={size} height={size} viewBox={micro ? "0 0 32 32" : "0 0 64 64"} fill="currentColor" aria-hidden="true" focusable="false">
      {micro ? <>
        <path d="M16 3h5v3l8 2v18l-7-2V12l-6-2Z" />
        <path d="M4 9h5v3l10 2v16l-5-1-2-10-4 9-5-1V10Z" />
      </> : <>
        <path d="M32 5h6a3 3 0 0 1 3 3v3l14 3a3 3 0 0 1 2 3v32a2 2 0 0 1-3 2l-9-2V21a5 5 0 0 0-4-5l-12-3V8a3 3 0 0 1 3-3Z" />
        <path d="M21 12h5a3 3 0 0 1 3 3v2l11 3a3 3 0 0 1 2 3v32a2 2 0 0 1-3 2l-8-2V30a5 5 0 0 0-4-5l-9-2v-8a3 3 0 0 1 3-3Z" />
        <path d="M10 21h5a3 3 0 0 1 3 3v2l8 2a3 3 0 0 1 2 3v27a2 2 0 0 1-3 2l-4-1-3-17c-.3-1.8-1.5-1.9-2.2-.2L10 55l-2-.6a3 3 0 0 1-2-3V24a3 3 0 0 1 4-3Z" />
      </>}
    </svg>
  );
}

// Resolve the saved surface before the page paints; keep the production dark default.
try {
  document.documentElement.dataset.theme = ((localStorage.getItem('archiver-theme') === 'light' || (localStorage.getItem('archiver-theme') === 'system' && matchMedia('(prefers-color-scheme: light)').matches)) || (localStorage.getItem('archiver-theme') === 'system' && matchMedia('(prefers-color-scheme: light)').matches)) ? 'light' : 'dark';
} catch {
  document.documentElement.dataset.theme = 'dark';
}

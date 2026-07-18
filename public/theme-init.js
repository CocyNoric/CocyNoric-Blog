try {
  var mode = localStorage.getItem('blog-color-mode');
  if (mode === 'dark' || (mode !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.dataset.theme = 'dark';
  }
} catch (_) {}

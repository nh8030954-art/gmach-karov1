try {
  if (localStorage.getItem('gmach-language') === 'en') {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  }
} catch { /* Storage can be disabled; Hebrew remains the safe default. */ }

/* Boot guard fail-safe: the main app normally reveals sooner. */
window.gmachBootFallback=window.setTimeout(()=>{
  document.documentElement.classList.remove("site-copy-pending","app-booting");
},8000);

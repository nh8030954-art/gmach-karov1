try {
  if (localStorage.getItem('gmach-language') === 'en') {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  }
} catch { /* Storage can be disabled; Hebrew remains the safe default. */ }

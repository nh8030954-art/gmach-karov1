try {
  if (localStorage.getItem('gmach-language') === 'en') {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    document.documentElement.classList.add('site-language-pending');
    window.addEventListener('load', () => document.documentElement.classList.remove('site-language-pending'), {once:true});
  }
} catch { /* Storage can be disabled; Hebrew remains the safe default. */ }

// Apply the saved palette before styles paint; the application validates it again.
(() => {
  try {
    const theme = JSON.parse(localStorage.getItem('kadr.preferences.v1') || '{}').theme;
    document.documentElement.dataset.theme = ['night', 'nord', 'sakura', 'cream'].includes(theme) ? theme : 'night';
  } catch { document.documentElement.dataset.theme = 'night'; }
})();

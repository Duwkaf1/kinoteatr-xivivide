// Apply the saved palette before styles paint; the application validates it again.
(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('kadr.preferences.v1') || '{}');
    const root = document.documentElement;
    root.dataset.theme = ['night', 'nord', 'sakura', 'cream', 'custom'].includes(saved.theme) ? saved.theme : 'night';
    if (saved.theme === 'custom') {
      const fallback = { background: '#15171c', panel: '#20232b', text: '#eeeef2', accent: '#f2c48f' };
      for (const key of Object.keys(fallback)) {
        const color = saved.custom?.[key];
        root.style.setProperty(`--custom-${key}`, typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : fallback[key]);
      }
      const light = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4).reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
      const accent = root.style.getPropertyValue('--custom-accent');
      const l = light(accent);
      root.style.setProperty('--custom-accent-ink', (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? '#000000' : '#ffffff');
      const radius = saved.custom?.radius;
      root.style.setProperty('--custom-radius', `${Number.isFinite(radius) ? Math.min(36, Math.max(12, Math.round(radius))) : 28}px`);
      root.dataset.customScheme = light(root.style.getPropertyValue('--custom-background')) > 0.4 ? 'light' : 'dark';
    }
  } catch { document.documentElement.dataset.theme = 'night'; }
})();

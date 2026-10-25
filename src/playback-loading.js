import { shouldReduceMotion } from './preferences.js';

// One loader per application, attached only while the current video is waiting.
// The sprite URL is assigned lazily: other modes never request the artwork.
export function playbackLoading({ host, preferences, reducedMotion }) {
  let pending = false; let visible = false; let timer; let root;
  function remove() { root?.remove(); root = null; }
  function render() {
    if (!pending || !visible || document.hidden || host.checkVisibility?.() === false) { remove(); return; }
    if (!root) {
      root = document.createElement('div'); root.id = 'playback-loading'; root.className = 'playback-loading'; root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite');
      const orb = document.createElement('div'); orb.className = 'loading-orb'; orb.setAttribute('aria-hidden', 'true');
      const sprite = document.createElement('span'); sprite.className = 'miku-sprite'; orb.append(sprite);
      const text = document.createElement('span'); text.className = 'loading-label'; text.textContent = 'Загружаем видео…'; root.append(orb, text); host.append(root);
    }
    const animated = preferences.profile === 'quality' && !shouldReduceMotion(preferences, reducedMotion.matches);
    root.classList.toggle('quality-loading', animated);
    const sprite = root.querySelector('.miku-sprite');
    if (animated) sprite.style.backgroundImage = `url("${new URL('quality/miku-dance.png', document.baseURI).href}")`;
    else sprite.style.removeProperty('background-image');
  }
  document.addEventListener('visibilitychange', render);
  return {
    show() {
      if (pending) return;
      pending = true; visible = false;
      timer = setTimeout(() => { visible = true; render(); }, 180);
    },
    hide() { pending = false; visible = false; clearTimeout(timer); remove(); },
    refresh: render,
  };
}

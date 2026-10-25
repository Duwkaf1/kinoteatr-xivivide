const paths = {
  edit: ['m15 4 5 5M4 20l4-1 12-12a2 2 0 0 0-5-5L3 14l-1 6Z'],
  portrait: ['M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z', 'M4 21v-2a8 8 0 0 1 16 0v2'],
  image: ['M4 4h16v16H4z', 'm4 16 5-5 4 4 3-3 4 4', 'M14 8h.01'],
  moon: ['M20.8 13.2A8.5 8.5 0 0 1 10.8 3a8.5 8.5 0 1 0 10 10.2Z'],
  library: ['M4 4h6v7H4zM14 4h6v7h-6zM4 15h6v5H4zM14 15h6v5h-6z'],
  heart: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z'],
  history: ['M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7M12 7v5l3 2'],
  sources: ['M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4'],
  import: ['M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5'],
  play: ['m9 5 11 7-11 7Z'],
  close: ['m6 6 12 12M18 6 6 18'],
  fullscreen: ['M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5'],
  cinema: ['M3 5h18v13H3zM8 22l4-4 4 4'],
  spark: ['m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z'],
  info: ['M12 8h.01M12 11v6', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'],
  arrow: ['M5 12h14m-5-5 5 5-5 5'],
  settings: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', 'm10 2-.7 2.3-2 .9-2.3-.7L2.7 8l1.6 1.8v2.4L2.7 14.5 5 18l2.3-.7 2 .9.7 3.8h4l.7-3.8 2-.9 2.3.7 2.3-3.5-1.6-2.3V9.8L21.3 8 19 4.5l-2.3.7-2-.9L14 2Z'],
  balance: ['M4 7h16M4 17h16M9 3v8m6 2v8'],
  leaf: ['M20 3C9 2 3 7 5 14c2 7 14 6 15-11ZM4 21l10-10'],
};
export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  for (const d of paths[name] ?? paths.play) { const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); svg.append(path); }
  return svg;
}
export function decorateIcons() { for (const item of document.querySelectorAll('[data-icon]')) item.replaceChildren(icon(item.dataset.icon)); }

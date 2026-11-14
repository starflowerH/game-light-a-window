// Inline hand-drawn SVG icons.
//
// Every glyph in the interface is one of these. v2 used emoji directly, which
// rendered as tofu blocks on machines without a colour emoji font.

const wrap = (body, extra) => '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + body + '</svg>'

export const ICONS = {
  sound: wrap('<path d="M4 9.5v5h3.2L12 18V6L7.2 9.5H4Z"/><path d="M15.4 8.6a4.6 4.6 0 0 1 0 6.8"/><path d="M17.8 6.3a7.8 7.8 0 0 1 0 11.4"/>'),
  mute: wrap('<path d="M4 9.5v5h3.2L12 18V6L7.2 9.5H4Z"/><path d="m16 9.5 5 5"/><path d="m21 9.5-5 5"/>'),
  pause: wrap('<path d="M9 5v14"/><path d="M15 5v14"/>'),
  play: wrap('<path d="M7 4.8 19 12 7 19.2V4.8Z"/>'),
  ledger: wrap('<path d="M5 4.5h11.5a2.5 2.5 0 0 1 2.5 2.5v12.5H7.5A2.5 2.5 0 0 1 5 17V4.5Z"/><path d="M5 17a2.5 2.5 0 0 1 2.5-2.5H19"/><path d="M9 8h7"/><path d="M9 11h5"/>'),
  close: wrap('<path d="m6 6 12 12"/><path d="m18 6-12 12"/>'),
  key: wrap('<circle cx="8.5" cy="12" r="3.6"/><path d="M12.1 12H21"/><path d="M18 12v3"/><path d="M15.4 12v2.4"/>'),
  heart: wrap('<path d="M12 20s-7.3-4.4-7.3-9.2A4.1 4.1 0 0 1 12 8.1a4.1 4.1 0 0 1 7.3 2.7C19.3 15.6 12 20 12 20Z"/>'),
  replay: wrap('<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4.6V9h4.4"/>'),
  home: wrap('<path d="m4 11 8-6.5 8 6.5"/><path d="M6.5 10.2V20h11v-9.8"/><path d="M10.4 20v-5.2h3.2V20"/>'),
  download: wrap('<path d="M12 4v10"/><path d="m8 10.6 4 4 4-4"/><path d="M5 19.5h14"/>'),
  star: wrap('<path d="m12 4.2 2.3 4.9 5.3.7-3.9 3.7 1 5.3-4.7-2.6-4.7 2.6 1-5.3L4.4 9.8l5.3-.7L12 4.2Z"/>'),
  moon: wrap('<path d="M20 14.4A8.2 8.2 0 0 1 9.6 4a8.4 8.4 0 1 0 10.4 10.4Z"/>'),
  lamp: wrap('<path d="M9 20h6"/><path d="M10 20v-3.4"/><path d="M14 20v-3.4"/><path d="M8.2 9.6h7.6L17 4.4H7l1.2 5.2Z"/><path d="M12 3v1.4"/>'),
  send: wrap('<path d="m4.5 12 15-7-5.2 14-3.6-5.6L4.5 12Z"/><path d="m10.7 13.4 8.8-8.4"/>'),
  check: wrap('<path d="m5 12.6 4.6 4.4L19 6.8"/>'),
  plus: wrap('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  umbrella: wrap('<path d="M3.4 12.4A8.6 8.6 0 0 1 20.6 12.4c0 .4-.5.6-.8.4a4.6 4.6 0 0 0-4.8.2c-.4.3-1 .3-1.4 0a4.6 4.6 0 0 0-4.8 0c-.4.3-1 .3-1.4 0a4.6 4.6 0 0 0-4.8-.2c-.3.2-.8 0-.8-.4Z"/><path d="M12 12.8V19a2.1 2.1 0 0 0 4.2 0"/>'),
  headphones: wrap('<path d="M4.6 15.4v-3a7.4 7.4 0 0 1 14.8 0v3"/><rect x="3" y="14" width="4" height="6.4" rx="1.6"/><rect x="17" y="14" width="4" height="6.4" rx="1.6"/>'),
  quilt: wrap('<path d="M4 8.6c2.6-2 5.4-2 8 0s5.4 2 8 0"/><path d="M4 13c2.6-2 5.4-2 8 0s5.4 2 8 0"/><path d="M4 17.4c2.6-2 5.4-2 8 0s5.4 2 8 0"/>'),
  bulb: wrap('<path d="M9.4 18.4h5.2"/><path d="M10.2 21h3.6"/><path d="M12 3.2a5.6 5.6 0 0 0-3.3 10.1c.5.4.8 1 .8 1.6v.3h5v-.3c0-.6.3-1.2.8-1.6A5.6 5.6 0 0 0 12 3.2Z"/>')
}

/**
 * Decorate every element carrying data-icon with its SVG.
 * @param {ParentNode} root
 */
export function paintIcons(root) {
  const nodes = root.querySelectorAll('[data-icon]')
  for (const node of nodes) {
    const name = node.getAttribute('data-icon')
    if (!name || !ICONS[name]) continue
    node.innerHTML = ICONS[name]
  }
}

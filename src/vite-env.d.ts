/// <reference types="vite/client" />

/**
 * The game instance is exposed on `window` so the scene can report taps and so
 * the browser console (and automated tests) can inspect live state.
 */
declare global {
  interface Window {
    __game: import('./game.js').Game
  }
}

export {}

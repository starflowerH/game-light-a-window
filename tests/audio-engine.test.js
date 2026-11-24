import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AudioEngine } from '../src/audio-engine.js'

function installAudioMocks() {
  const prevWindow = globalThis.window
  const prevUrl = globalThis.URL
  /** @type {Array<any>} */
  const createdAudios = []

  class FakeAudio {
    constructor(src = '') {
      this.src = src
      this.preload = ''
      this.loop = false
      this.volume = 1
      this.muted = false
      this.paused = true
      this.playCalls = 0
      this.pauseCalls = 0
      /** @type {(() => void) | null} */
      this.onerror = null
      createdAudios.push(this)
    }

    play() {
      this.playCalls += 1
      this.paused = false
      return Promise.resolve()
    }

    pause() {
      this.pauseCalls += 1
      this.paused = true
    }
  }

  class FakeAudioContext {
    constructor() {
      this.currentTime = 0
      this.sampleRate = 44100
      this.state = 'running'
      this.destination = {}
    }

    resume() {
      this.state = 'running'
      return Promise.resolve()
    }

    close() {
      this.state = 'closed'
      return Promise.resolve()
    }

    createGain() {
      return {
        gain: {
          value: 1,
          setValueAtTime() {},
          setTargetAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {}
        },
        connect() {}
      }
    }

    createDynamicsCompressor() {
      return {
        threshold: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 1 },
        attack: { value: 0 },
        release: { value: 0 },
        connect() {}
      }
    }

    createConvolver() {
      return { buffer: null, connect() {} }
    }

    createBuffer(channels, length) {
      const chData = Array.from({ length: channels }, () => new Float32Array(length))
      return { getChannelData: idx => chData[idx] }
    }

    createBufferSource() {
      return { buffer: null, loop: false, connect() {}, start() {}, stop() {} }
    }

    createBiquadFilter() {
      return {
        type: 'lowpass',
        frequency: { value: 0, setTargetAtTime() {} },
        Q: { value: 0, setTargetAtTime() {} },
        connect() {}
      }
    }

    createOscillator() {
      return {
        type: 'sine',
        frequency: { value: 0, setValueAtTime() {}, setTargetAtTime() {}, exponentialRampToValueAtTime() {} },
        detune: { value: 0 },
        connect() {},
        start() {},
        stop() {}
      }
    }

    createStereoPanner() {
      return { pan: { value: 0 }, connect() {} }
    }
  }

  /** @type {any} */ (globalThis).window = {
    Audio: FakeAudio,
    AudioContext: FakeAudioContext
  }

  return {
    createdAudios,
    restore() {
      if (prevWindow === undefined) delete globalThis.window
      else globalThis.window = prevWindow
      globalThis.URL = prevUrl
    }
  }
}

describe('AudioEngine default lazy theme BGM', () => {
  /** @type {ReturnType<typeof installAudioMocks>} */
  let env

  beforeEach(() => {
    env = installAudioMocks()
  })

  afterEach(() => {
    env.restore()
  })

  it('defaults to the lazy theme track without downloading pre-gesture', () => {
    const engine = new AudioEngine()
    expect(engine.getBgmState()).toEqual({
      mode: 'theme',
      activeTrack: 'theme',
      customTitle: '',
      muted: false
    })
    expect(env.createdAudios.length).toBe(0)

    engine.setBgmTrack('theme')
    expect(env.createdAudios.length).toBe(1)
    expect(env.createdAudios[0].src).toBe('./audio/bgm-default.mp3')
    expect(env.createdAudios[0].preload).toBe('none')
    expect(env.createdAudios[0].playCalls).toBe(0)
    engine.dispose()
  })

  it('starts playing default theme on unlock and switches cleanly to procedural scores', () => {
    const engine = new AudioEngine()
    expect(engine.unlock()).toBe(true)
    expect(env.createdAudios.length).toBe(1)
    const themeEl = env.createdAudios[0]
    expect(themeEl.loop).toBe(true)
    expect(themeEl.preload).toBe('auto')
    expect(themeEl.playCalls).toBe(1)
    expect(themeEl.paused).toBe(false)

    engine.setBgmTrack('kataware')
    expect(themeEl.paused).toBe(true)
    expect(themeEl.pauseCalls).toBe(1)
    expect(engine.getBgmState()).toMatchObject({ mode: 'kataware', activeTrack: 'kataware' })

    engine.setBgmTrack('theme')
    expect(themeEl.paused).toBe(false)
    expect(themeEl.playCalls).toBe(2)
    expect(engine.getBgmState()).toMatchObject({ mode: 'theme', activeTrack: 'theme' })
    engine.dispose()
  })

  it('propagates mute/unmute cleanly and resumes theme playback on unmute', () => {
    const engine = new AudioEngine()
    engine.unlock()
    const themeEl = env.createdAudios[0]

    engine.setMuted(true)
    expect(themeEl.muted).toBe(true)

    themeEl.paused = true
    engine.setMuted(false)
    expect(themeEl.muted).toBe(false)
    expect(themeEl.paused).toBe(false)
    engine.dispose()
  })

  it('falls back seamlessly to procedural kataware if the theme audio errors', () => {
    const engine = new AudioEngine()
    engine.unlock()
    const themeEl = env.createdAudios[0]
    expect(typeof themeEl.onerror).toBe('function')

    themeEl.onerror()
    expect(engine.getBgmState()).toEqual({
      mode: 'theme',
      activeTrack: 'kataware',
      customTitle: '',
      muted: false
    })
    engine.dispose()
  })

  it('pauses default theme when loading a custom local audio file and cleans up on dispose', () => {
    /** @type {any} */ (globalThis).URL = {
      createObjectURL: () => 'blob:custom-song',
      revokeObjectURL: () => {}
    }
    const engine = new AudioEngine()
    engine.unlock()
    const themeEl = env.createdAudios[0]

    expect(engine.loadCustomAudioFile({ name: 'my_campus_song.mp3' })).toBe(true)
    expect(themeEl.paused).toBe(true)
    expect(env.createdAudios.length).toBe(2)
    expect(env.createdAudios[1].src).toBe('blob:custom-song')
    expect(engine.getBgmState()).toMatchObject({ activeTrack: 'custom', customTitle: 'my_campus_song' })

    engine.dispose()
    expect(themeEl.src).toBe('')
  })
})

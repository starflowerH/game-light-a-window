import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  CAMPUS_CATS,
  CAMPUS_PEDESTRIANS,
  CampusCritterSystem,
  renderCatPortraitSvg
} from '../src/campus-critters.js'
import { RANDOM_EVENTS } from '../src/random-events.js'
import { loadRecords } from '../src/records.js'

describe('campus-critters & tranquil snow night upgrades', () => {
  it('defines 3 distinct interactive cats and 3 winter pedestrians', () => {
    expect(CAMPUS_CATS).toHaveLength(3)
    expect(CAMPUS_CATS.map(c => c.id)).toEqual(['mochi', 'marmalade', 'sooty'])
    expect(CAMPUS_PEDESTRIANS).toHaveLength(3)
    for (const c of CAMPUS_CATS) {
      const svg = renderCatPortraitSvg(c.id)
      expect(svg).toContain('<svg')
    }
  })

  it('constructs 3D articulated cats/birds/pedestrians and updates stats on pet & feed', () => {
    const scene = new THREE.Scene()
    const bursts = []
    const sys = new CampusCritterSystem(scene, {
      vfx: { emitBurst: (pos, color, n) => bursts.push({ pos, color, n }) }
    })

    expect(sys.cats).toHaveLength(3)
    expect(sys.birds).toHaveLength(6)
    expect(sys.pedestrians).toHaveLength(3)
    expect(sys.getRooftopCatGroup()).toBeTruthy()
    expect(sys.pickables.length).toBe(6)

    const before = sys.getCatSnapshot('mochi')
    const afterPet = sys.interactCat('mochi', 'pet')
    expect(afterPet.warmth).toBeGreaterThan(before.warmth)
    expect(afterPet.bond).toBeGreaterThan(before.bond)
    expect(afterPet.petCount).toBe(1)

    const afterFeed = sys.interactCat('mochi', 'feed')
    expect(afterFeed.fullness).toBeGreaterThan(afterPet.fullness)
    expect(afterFeed.feedCount).toBe(1)
    expect(bursts.length).toBe(2)

    sys.triggerBirdFlyby()
    sys.update(1.5, false)
    sys.dispose()
    expect(sys.cats).toHaveLength(0)
  })

  it('defaults preferredDorm to 30-window grad and preferredWeather to snow', () => {
    const rec = loadRecords()
    expect(rec.preferredDorm).toBe('grad')
    expect(rec.preferredWeather).toBe('snow')
    const ids = RANDOM_EVENTS.map(e => e.id)
    expect(ids).toContain('evt_snow_birds')
    expect(ids).toContain('evt_bench_cat')
  })
})

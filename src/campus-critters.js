import * as THREE from 'three'

const BASE_Y = -210

/**
 * Interactive campus cats living around the dormitory plaza, pond & rooftop.
 * Procedural articulated meshes (zero extra GLB download cost).
 */
export const CAMPUS_CATS = [
  {
    id: 'mochi',
    name: '糯米',
    breed: '三花猫',
    spotName: '17号楼前阶长椅旁',
    rooftop: false,
    homePos: { x: -122, yOff: 2, z: 132 },
    yaw: 0.42,
    coatPalette: {
      primary: 0xf5ede0,
      patchA: 0xde8e46,
      patchB: 0x352b27,
      belly: 0xfbf7ef,
      earInner: 0xf2a5ae,
      eye: 0x73c978,
      collar: 0xe2645a
    },
    defaultMood: '窝在木长椅边听楼前落雪，耳朵随着风声一抖一抖。',
    bio: '林阿姨每晚留半碟温羊奶的常客，最喜欢蹭晚归同学的裤脚。',
    petLines: [
      '「呼噜呼噜……」糯米眯起绿眼睛，主动把下巴往你掌心蹭了蹭。',
      '糯米踩了踩前爪发出软软的「喵～」，脖颈小铜铃轻响了一声。',
      '雪粒落在鼻尖，糯米甩甩胡须又贴紧你的手背暖了暖。'
    ],
    feedLines: [
      '糯米叼着小鱼干开心得尾巴竖成小问号，吃得连胡须都在颤！',
      '「咔哧咔哧～」不到十秒吃完，糯米还认真舔了舔前爪向你致谢。',
      '收到热乎乎的小鱼干后，糯米直接在雪夜里开启了大功率呼噜模式。'
    ],
    initialStats: { warmth: 78, fullness: 72, bond: 68 }
  },
  {
    id: 'marmalade',
    name: '橘座',
    breed: '胖橘猫',
    spotName: '宿舍楼顶星光棚',
    rooftop: true,
    homePos: { x: 74, yOff: 370, z: 42 },
    yaw: -0.35,
    coatPalette: {
      primary: 0xe69546,
      patchA: 0xc26c28,
      patchB: 0xf6dfc0,
      belly: 0xf9ecda,
      earInner: 0xf4a8b0,
      eye: 0xf2bf48,
      collar: 0x5ea8d8
    },
    defaultMood: '蹲在屋脊边巡视整条银杏路，大尾巴慢悠悠扫着雪花。',
    bio: '传说住得比宿管还久，谁把窗灯连成星轨，它就在屋顶晃尾巴喝彩。',
    petLines: [
      '橘座喉咙里滚出浑厚的呼噜声，大橘肚皮暖得像刚出炉的烤红薯！',
      '「喵呜～」橘座大方地把大脑袋埋进你指缝里求顺毛。',
      '楼顶夜风凉，橘座偏偏靠在你手边眯成了一条金灿灿的线。'
    ],
    feedLines: [
      '一口一条小鱼干！橘座的背影肉眼可见地又圆润了半分。',
      '橘座舔净嘴角后郑重地冲整栋楼「喵」了一声，像是在巡逻嘉奖。',
      '小鱼干精准投喂！橘座尾巴翘得比避雷针还稳。'
    ],
    initialStats: { warmth: 84, fullness: 86, bond: 74 }
  },
  {
    id: 'sooty',
    name: '煤球',
    breed: '玄猫白爪',
    spotName: '莲池木桥石灯笼旁',
    rooftop: false,
    homePos: { x: 378, yOff: 3, z: 86 },
    yaw: -0.92,
    coatPalette: {
      primary: 0x282b3a,
      patchA: 0x181a24,
      patchB: 0xf2eee8,
      belly: 0xf2eee8,
      earInner: 0xd696a2,
      eye: 0x9ce868,
      collar: 0xf2b857
    },
    defaultMood: '蹲在石灯笼边盯住池底巡游的锦鲤影，四只雪白小爪踩得笔直。',
    bio: '东侧小桥夜巡卫士，下雪夜会借桥梁灯笼的一点暖意烘胡须。',
    petLines: [
      '煤球先是矜持地歪了歪头，随后悄悄伸出一只白手套搭在你的指尖。',
      '在暗蓝夜色里亮起两颗翡翠绿眼瞳，煤球轻声发出温柔的夹子音「咪～」',
      '乌亮短毛在手心滑溜溜的，像摸到一块晒过太阳的暖绒黑石子。'
    ],
    feedLines: [
      '煤球叼走小鱼干后退到木桥灯影下，嚼得津津有味还不忘盯鱼。',
      '「咪呜！」白胡须一翘一翘，看得出这是煤球今夜最满意的宵夜。',
      '吃完小鱼干，煤球围着你的鞋尖轻轻绕了半圈表达喜欢。'
    ],
    initialStats: { warmth: 70, fullness: 65, bond: 62 }
  }
]

export const CAMPUS_PEDESTRIANS = [
  {
    id: 'sketch_senior',
    name: '抱画板的林同学',
    quote: '「雪落在路灯底下居然带一点奶油黄，回去正好把今晚的宿舍窗画进速写里。」',
    laneZ: 170,
    xMin: -460,
    xMax: 160,
    speed: 14,
    phase: 0.4,
    heightScale: 1.0,
    coatColor: 0x5c7296,
    scarfColor: 0xd9806c,
    propKind: 'sketchbook'
  },
  {
    id: 'tea_runner',
    name: '捧热奶茶晚归的小陈',
    quote: '「校门口摊主的姜汁可可还在保温，这杯正好揣在围巾里暖手回楼。」',
    laneZ: 180,
    xMin: -180,
    xMax: 470,
    speed: 17,
    phase: 2.3,
    heightScale: 0.96,
    coatColor: 0x9c6e58,
    scarfColor: 0xe6b974,
    propKind: 'lantern'
  },
  {
    id: 'night_patron',
    name: '散步消食的研究生学长',
    quote: '「刚从图书馆出来，看见 17 号楼亮着那么多小窗，突然没那么累了。」',
    laneZ: 256,
    xMin: -500,
    xMax: 500,
    speed: 12,
    phase: 4.1,
    heightScale: 1.04,
    coatColor: 0x3b4863,
    scarfColor: 0x8ea8b8,
    propKind: 'umbrella'
  }
]

function clampStat(v) {
  return Math.max(0, Math.min(100, Math.round(v)))
}

function makeMat(hex, roughness = 0.85, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color: hex,
    roughness,
    metalness: 0.04,
    ...extra
  })
}

/**
 * Hand-crafted Stardew-style SVG portrait matching each campus cat's markings.
 * @param {string} catId
 * @returns {string}
 */
export function renderCatPortraitSvg(catId) {
  const cat = CAMPUS_CATS.find(c => c.id === catId) || CAMPUS_CATS[0]
  if (cat.id === 'marmalade') {
    return (
      '<svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">' +
        '<rect x="4" y="4" width="88" height="88" rx="22" fill="#1d253d" stroke="rgba(255,224,168,0.45)" stroke-width="2"/>' +
        '<circle cx="48" cy="54" r="24" fill="#e69546"/>' +
        '<polygon points="26,38 24,17 41,29" fill="#e69546"/>' +
        '<polygon points="70,38 72,17 55,29" fill="#e69546"/>' +
        '<polygon points="28,35 27,22 37,30" fill="#f4a8b0"/>' +
        '<polygon points="68,35 69,22 59,30" fill="#f4a8b0"/>' +
        '<ellipse cx="48" cy="60" rx="14" ry="11" fill="#f9ecda"/>' +
        '<path d="M40,36 L44,41 L48,35 L52,41 L56,36" stroke="#b35c1e" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
        '<circle cx="38" cy="50" r="3.4" fill="#f5c64b"/><circle cx="38" cy="50" r="1.7" fill="#181822"/>' +
        '<circle cx="58" cy="50" r="3.4" fill="#f5c64b"/><circle cx="58" cy="50" r="1.7" fill="#181822"/>' +
        '<polygon points="46,56 50,56 48,59" fill="#ea8a90"/>' +
        '<path d="M44,61 Q48,64 52,61" stroke="#6c4228" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
        '<rect x="33" y="74" width="30" height="5" rx="2.5" fill="#5ea8d8"/><circle cx="48" cy="79" r="3.5" fill="#ffd978"/>' +
      '</svg>'
    )
  }
  if (cat.id === 'sooty') {
    return (
      '<svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">' +
        '<rect x="4" y="4" width="88" height="88" rx="22" fill="#182138" stroke="rgba(255,224,168,0.42)" stroke-width="2"/>' +
        '<circle cx="48" cy="54" r="23" fill="#252838"/>' +
        '<polygon points="26,38 23,17 41,29" fill="#252838"/>' +
        '<polygon points="70,38 73,17 55,29" fill="#252838"/>' +
        '<polygon points="28,35 26,22 37,30" fill="#c78a96"/>' +
        '<polygon points="68,35 70,22 59,30" fill="#c78a96"/>' +
        '<ellipse cx="48" cy="61" rx="12" ry="9" fill="#f2eee8"/>' +
        '<circle cx="38" cy="50" r="3.8" fill="#a2ec6c"/><circle cx="38" cy="50" r="1.8" fill="#12141c"/>' +
        '<circle cx="58" cy="50" r="3.8" fill="#a2ec6c"/><circle cx="58" cy="50" r="1.8" fill="#12141c"/>' +
        '<polygon points="46,56 50,56 48,59" fill="#e58f9b"/>' +
        '<path d="M44,61 Q48,64 52,61" stroke="#424658" stroke-width="1.7" fill="none" stroke-linecap="round"/>' +
        '<rect x="34" y="74" width="28" height="5" rx="2.5" fill="#f2b857"/><circle cx="48" cy="79" r="3.5" fill="#fff0b8"/>' +
      '</svg>'
    )
  }
  return (
    '<svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">' +
      '<rect x="4" y="4" width="88" height="88" rx="22" fill="#1d263e" stroke="rgba(255,224,168,0.45)" stroke-width="2"/>' +
      '<circle cx="48" cy="54" r="23" fill="#f6efe2"/>' +
      '<polygon points="26,38 23,17 41,29" fill="#de8e46"/>' +
      '<polygon points="70,38 73,17 55,29" fill="#3b302c"/>' +
      '<polygon points="28,35 26,22 37,30" fill="#f4a8b0"/>' +
      '<polygon points="68,35 70,22 59,30" fill="#f4a8b0"/>' +
      '<path d="M27,44 Q38,34 45,46 Q33,54 27,44 Z" fill="#de8e46"/>' +
      '<path d="M51,42 Q61,32 70,46 Q60,55 51,42 Z" fill="#3b302c"/>' +
      '<circle cx="38" cy="51" r="3.5" fill="#72ca78"/><circle cx="38" cy="51" r="1.7" fill="#151822"/>' +
      '<circle cx="58" cy="51" r="3.5" fill="#72ca78"/><circle cx="58" cy="51" r="1.7" fill="#151822"/>' +
      '<polygon points="46,57 50,57 48,60" fill="#eb8f9a"/>' +
      '<path d="M44,62 Q48,65 52,62" stroke="#6c5448" stroke-width="1.7" fill="none" stroke-linecap="round"/>' +
      '<rect x="34" y="74" width="28" height="5" rx="2.5" fill="#e2645a"/><circle cx="48" cy="79" r="3.5" fill="#ffd978"/>' +
    '</svg>'
  )
}

/**
 * Multi-species 3D animated ecology inside the Three.js campus:
 *  - 3 articulated interactive cats (calico, orange tabby, tuxedo black)
 *  - 6 flapping twilight/snow birds orbiting roof & clocktower
 *  - 3 strolling winter-dressed campus pedestrians along the lit sidewalk
 */
export class CampusCritterSystem {
  /** @param {THREE.Scene} scene @param {{ vfx?: any }} [opts] */
  constructor(scene, opts = {}) {
    this.scene = scene
    this.vfx = opts.vfx || null
    this.root = new THREE.Group()
    this.root.name = 'CampusCritterEcology'
    this.scene.add(this.root)

    /** @type {THREE.Object3D[]} */
    this.pickables = []
    /** @type {any[]} */
    this.cats = []
    /** @type {any[]} */
    this.birds = []
    /** @type {any[]} */
    this.pedestrians = []
    /** @type {Map<string, any>} */
    this._catStates = new Map()
    /** @type {{ x: number, y: number, z: number }|null} */
    this._roofOverride = null
    this._flockBoostUntil = 0

    for (const def of CAMPUS_CATS) {
      this._catStates.set(def.id, {
        ...def.initialStats,
        moodText: def.defaultMood,
        petCount: 0,
        feedCount: 0,
        happyUntil: 0,
        happyKind: 'pet'
      })
    }

    this._buildCats()
    this._buildBirds()
    this._buildPedestrians()
  }

  _registerPickable(mesh, kind, id) {
    mesh.userData = { ...(mesh.userData || {}), critterKind: kind, critterId: id }
    this.pickables.push(mesh)
  }

  _buildCats() {
    const legGeo = new THREE.CapsuleGeometry(1.15, 2.5, 4, 8)
    const pawGeo = new THREE.SphereGeometry(1.35, 10, 8)
    const eyeGeo = new THREE.SphereGeometry(0.68, 8, 8)
    const pupilGeo = new THREE.SphereGeometry(0.36, 6, 6)
    const earGeo = new THREE.ConeGeometry(1.7, 3.2, 4)
    const earInGeo = new THREE.ConeGeometry(0.92, 1.9, 4)
    const noseGeo = new THREE.SphereGeometry(0.55, 6, 6)
    const tailSegGeo = new THREE.CapsuleGeometry(0.88, 3.2, 4, 8)
    const bellGeo = new THREE.SphereGeometry(0.95, 8, 8)
    const hitboxGeo = new THREE.SphereGeometry(23, 8, 8)
    const hitboxMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })

    const noseMat = makeMat(0xeb929a, 0.55)
    const pupilMat = makeMat(0x14161e, 0.25)
    const bellMat = new THREE.MeshStandardMaterial({ color: 0xffd76a, roughness: 0.28, metalness: 0.55, emissive: 0x3b2606, emissiveIntensity: 0.25 })

    for (const def of CAMPUS_CATS) {
      const p = def.coatPalette
      const mainMat = makeMat(p.primary, 0.84)
      const patchAMat = makeMat(p.patchA, 0.84)
      const patchBMat = makeMat(p.patchB, 0.86)
      const bellyMat = makeMat(p.belly, 0.88)
      const earInMat = makeMat(p.earInner, 0.78)
      const eyeMat = new THREE.MeshStandardMaterial({
        color: p.eye,
        emissive: p.eye,
        emissiveIntensity: 0.26,
        roughness: 0.24
      })
      const collarMat = makeMat(p.collar, 0.58)

      const group = new THREE.Group()
      group.name = 'Cat_' + def.id
      group.position.set(def.homePos.x, BASE_Y + def.homePos.yOff, def.homePos.z)
      group.rotation.y = def.yaw

      const bodyPivot = new THREE.Group()
      group.add(bodyPivot)

      // Soft plumpy torso + chest ruff + characteristic coat patches
      const torso = new THREE.Mesh(new THREE.SphereGeometry(4.4, 14, 12), mainMat)
      torso.scale.set(0.88, 0.86, 1.38)
      torso.position.set(0, 5.2, 0)
      torso.castShadow = true
      bodyPivot.add(torso)

      const chest = new THREE.Mesh(new THREE.SphereGeometry(3.1, 12, 10), bellyMat)
      chest.scale.set(0.92, 1.05, 0.85)
      chest.position.set(0, 5.0, 3.8)
      bodyPivot.add(chest)

      // Patch spots along back/flank for distinct silhouette readability
      const backSpot = new THREE.Mesh(new THREE.SphereGeometry(2.6, 10, 8), patchAMat)
      backSpot.scale.set(1.02, 0.72, 1.15)
      backSpot.position.set(1.3, 6.7, 0.4)
      bodyPivot.add(backSpot)

      const hipSpot = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), def.id === 'sooty' ? mainMat : patchBMat)
      hipSpot.scale.set(0.95, 0.74, 1.0)
      hipSpot.position.set(-1.3, 6.3, -2.8)
      bodyPivot.add(hipSpot)

      // 4 legs + white or tinted paws
      const legCoords = [
        [-2.0, 2.2, 3.0],
        [2.0, 2.2, 3.0],
        [-2.1, 2.2, -3.1],
        [2.1, 2.2, -3.1]
      ]
      const legs = []
      const pawMat = (def.id === 'sooty' || def.id === 'mochi') ? bellyMat : patchBMat
      for (const [lx, ly, lz] of legCoords) {
        const lPivot = new THREE.Group()
        lPivot.position.set(lx, ly + 1.4, lz)
        const legM = new THREE.Mesh(legGeo, mainMat)
        legM.position.set(0, -1.2, 0)
        legM.castShadow = true
        const pawM = new THREE.Mesh(pawGeo, pawMat)
        pawM.scale.set(1, 0.65, 1.2)
        pawM.position.set(0, -2.5, 0.35)
        lPivot.add(legM, pawM)
        bodyPivot.add(lPivot)
        legs.push(lPivot)
      }

      // Head group
      const headPivot = new THREE.Group()
      headPivot.position.set(0, 8.7, 4.9)
      bodyPivot.add(headPivot)

      const head = new THREE.Mesh(new THREE.SphereGeometry(3.65, 14, 12), mainMat)
      head.scale.set(1.06, 0.96, 0.98)
      head.castShadow = true
      headPivot.add(head)

      const muzzle = new THREE.Mesh(new THREE.SphereGeometry(1.75, 10, 8), bellyMat)
      muzzle.scale.set(1.18, 0.82, 0.9)
      muzzle.position.set(0, -0.75, 2.85)
      headPivot.add(muzzle)

      if (def.id === 'mochi') {
        const earPatchL = new THREE.Mesh(new THREE.SphereGeometry(1.8, 10, 8), patchAMat)
        earPatchL.position.set(-1.7, 1.3, 0.8)
        const earPatchR = new THREE.Mesh(new THREE.SphereGeometry(1.9, 10, 8), patchBMat)
        earPatchR.position.set(1.6, 1.4, 0.6)
        headPivot.add(earPatchL, earPatchR)
      }

      const earL = new THREE.Mesh(earGeo, def.id === 'mochi' ? patchAMat : mainMat)
      earL.position.set(-2.2, 3.0, 0.2)
      earL.rotation.set(0.12, 0.4, 0.26)
      const earR = new THREE.Mesh(earGeo, def.id === 'mochi' ? patchBMat : mainMat)
      earR.position.set(2.2, 3.0, 0.2)
      earR.rotation.set(0.12, -0.4, -0.26)
      const earInL = new THREE.Mesh(earInGeo, earInMat)
      earInL.position.set(-2.15, 2.85, 0.55)
      earInL.rotation.copy(earL.rotation)
      const earInR = new THREE.Mesh(earInGeo, earInMat)
      earInR.position.set(2.15, 2.85, 0.55)
      earInR.rotation.copy(earR.rotation)
      headPivot.add(earL, earR, earInL, earInR)

      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(eyeGeo, eyeMat)
        eye.position.set(sx * 1.48, 0.35, 3.1)
        const pup = new THREE.Mesh(pupilGeo, pupilMat)
        pup.position.set(sx * 1.48, 0.35, 3.55)
        headPivot.add(eye, pup)
      }
      const nose = new THREE.Mesh(noseGeo, noseMat)
      nose.position.set(0, -0.35, 3.72)
      headPivot.add(nose)

      // Collar & bell
      const collar = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.38, 8, 16), collarMat)
      collar.rotation.x = Math.PI * 0.42
      collar.position.set(0, 7.2, 3.95)
      const bell = new THREE.Mesh(bellGeo, bellMat)
      bell.position.set(0, 6.2, 5.75)
      bodyPivot.add(collar, bell)

      // Two-segment articulated tail for graceful S-curve motion
      const tailBase = new THREE.Group()
      tailBase.position.set(0, 6.0, -5.2)
      const tailLower = new THREE.Mesh(tailSegGeo, def.id === 'mochi' ? patchBMat : mainMat)
      tailLower.rotation.x = -0.75
      tailLower.position.set(0, 1.4, -1.3)
      tailBase.add(tailLower)

      const tailTipPivot = new THREE.Group()
      tailTipPivot.position.set(0, 2.7, -2.5)
      const tailUpper = new THREE.Mesh(tailSegGeo, def.id === 'sooty' ? bellyMat : patchAMat)
      tailUpper.rotation.x = -0.35
      tailUpper.position.set(0, 1.8, -0.8)
      tailTipPivot.add(tailUpper)
      tailBase.add(tailTipPivot)
      bodyPivot.add(tailBase)

      // Generous invisible raycast hitbox for effortless desktop/touch clicking
      const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat)
      hitbox.position.set(0, 7, 1)
      group.add(hitbox)
      this._registerPickable(hitbox, 'cat', def.id)

      this.root.add(group)
      this.cats.push({
        def,
        root: group,
        bodyPivot,
        headPivot,
        tailBase,
        tailTipPivot,
        legs,
        baseX: group.position.x,
        baseY: group.position.y,
        baseZ: group.position.z,
        baseYaw: def.yaw,
        roamRadius: def.rooftop ? 12 : 20,
        roamSpeed: 0.24 + this.cats.length * 0.06
      })
    }
  }

  _buildBirds() {
    const bodyGeo = new THREE.SphereGeometry(2.0, 10, 8)
    const headGeo = new THREE.SphereGeometry(1.35, 8, 8)
    const wingGeo = new THREE.BoxGeometry(5.6, 0.35, 2.4)
    const tailGeo = new THREE.ConeGeometry(1.2, 2.8, 4)
    const eyeGeo = new THREE.SphereGeometry(0.28, 6, 6)

    const featherMats = [
      makeMat(0x8899bc, 0.80),
      makeMat(0xa5b4cf, 0.78),
      makeMat(0x7c708a, 0.82)
    ]
    const wingTipMat = makeMat(0x3b445e, 0.84)
    const owlEyeMat = new THREE.MeshStandardMaterial({ color: 0xffe28a, emissive: 0xffc850, emissiveIntensity: 0.38 })

    const birdConfigs = [
      { cx: -320, cz: -140, y: BASE_Y + 410, rx: 165, rz: 105, speed: 0.24, phase: 0.0, scale: 1.05 },
      { cx: -210, cz: -85, y: BASE_Y + 375, rx: 140, rz: 95, speed: 0.28, phase: 2.1, scale: 0.92 },
      { cx: 140, cz: -40, y: BASE_Y + 340, rx: 220, rz: 120, speed: 0.22, phase: 1.1, scale: 1.0 },
      { cx: 290, cz: 45, y: BASE_Y + 295, rx: 155, rz: 90, speed: 0.27, phase: 3.6, scale: 0.88 },
      { cx: -40, cz: 35, y: BASE_Y + 435, rx: 245, rz: 115, speed: 0.20, phase: 4.5, scale: 0.96 },
      { cx: 410, cz: -70, y: BASE_Y + 335, rx: 140, rz: 110, speed: 0.25, phase: 5.2, scale: 0.90 }
    ]

    for (let i = 0; i < birdConfigs.length; i++) {
      const cfg = birdConfigs[i]
      const g = new THREE.Group()
      g.name = 'NightBird_' + i
      g.scale.setScalar(cfg.scale)

      const mat = featherMats[i % featherMats.length]
      const body = new THREE.Mesh(bodyGeo, mat)
      body.scale.set(0.85, 0.85, 1.55)
      const head = new THREE.Mesh(headGeo, mat)
      head.position.set(0, 0.65, 2.35)
      const tail = new THREE.Mesh(tailGeo, wingTipMat)
      tail.rotation.x = -Math.PI * 0.55
      tail.position.set(0, 0.15, -3.2)

      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(eyeGeo, owlEyeMat)
        eye.position.set(sx * 0.6, 0.85, 3.35)
        g.add(eye)
      }

      const leftWing = new THREE.Group()
      leftWing.position.set(-1.1, 0.4, 0.2)
      const lwMesh = new THREE.Mesh(wingGeo, wingTipMat)
      lwMesh.position.set(-2.7, 0, -0.2)
      leftWing.add(lwMesh)

      const rightWing = new THREE.Group()
      rightWing.position.set(1.1, 0.4, 0.2)
      const rwMesh = new THREE.Mesh(wingGeo, wingTipMat)
      rwMesh.position.set(2.7, 0, -0.2)
      rightWing.add(rwMesh)

      g.add(body, head, tail, leftWing, rightWing)
      this.root.add(g)
      this.birds.push({ cfg, group: g, leftWing, rightWing, lastX: cfg.cx, lastZ: cfg.cz })
    }
  }

  _buildPedestrians() {
    const headGeo = new THREE.SphereGeometry(3.2, 12, 10)
    const coatGeo = new THREE.CapsuleGeometry(3.8, 9.2, 6, 12)
    const scarfGeo = new THREE.TorusGeometry(2.9, 1.05, 8, 14)
    const limbGeo = new THREE.CapsuleGeometry(1.25, 6.6, 4, 8)
    const hatGeo = new THREE.SphereGeometry(3.3, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.58)
    const hitboxGeo = new THREE.CapsuleGeometry(7.5, 26, 4, 8)
    const hitboxMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    const skinMat = makeMat(0xf4d2bc, 0.78)
    const pantsMat = makeMat(0x23293a, 0.88)
    const propDarkMat = makeMat(0x3a3234, 0.75)

    for (const def of CAMPUS_PEDESTRIANS) {
      const coatMat = makeMat(def.coatColor, 0.84)
      const scarfMat = makeMat(def.scarfColor, 0.88)

      const g = new THREE.Group()
      g.name = 'Pedestrian_' + def.id
      g.scale.setScalar(def.heightScale)

      const bodyGroup = new THREE.Group()
      g.add(bodyGroup)

      const leftLeg = new THREE.Group()
      leftLeg.position.set(-1.6, 8.6, 0)
      const llMesh = new THREE.Mesh(limbGeo, pantsMat)
      llMesh.position.y = -4.2
      llMesh.castShadow = true
      leftLeg.add(llMesh)

      const rightLeg = new THREE.Group()
      rightLeg.position.set(1.6, 8.6, 0)
      const rlMesh = new THREE.Mesh(limbGeo, pantsMat)
      rlMesh.position.y = -4.2
      rlMesh.castShadow = true
      rightLeg.add(rlMesh)

      const coat = new THREE.Mesh(coatGeo, coatMat)
      coat.position.set(0, 16.5, 0)
      coat.scale.set(1.06, 1.0, 0.84)
      coat.castShadow = true

      const scarf = new THREE.Mesh(scarfGeo, scarfMat)
      scarf.rotation.x = Math.PI * 0.48
      scarf.position.set(0, 22.8, 0.2)

      const head = new THREE.Mesh(headGeo, skinMat)
      head.position.set(0, 26.8, 0)
      const beanie = new THREE.Mesh(hatGeo, scarfMat)
      beanie.position.set(0, 27.6, -0.2)

      const leftArm = new THREE.Group()
      leftArm.position.set(-4.3, 21.6, 0)
      const laMesh = new THREE.Mesh(limbGeo, coatMat)
      laMesh.position.y = -3.8
      leftArm.add(laMesh)

      const rightArm = new THREE.Group()
      rightArm.position.set(4.3, 21.6, 0)
      const raMesh = new THREE.Mesh(limbGeo, coatMat)
      raMesh.position.y = -3.8
      rightArm.add(raMesh)

      if (def.propKind === 'lantern') {
        const orb = new THREE.Mesh(
          new THREE.SphereGeometry(1.75, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0xffd288, emissive: 0xffad4e, emissiveIntensity: 0.72, roughness: 0.35 })
        )
        orb.position.set(0, -8.8, 1.4)
        rightArm.add(orb)
      } else if (def.propKind === 'sketchbook') {
        const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 6.2, 5.2), propDarkMat)
        board.position.set(-1.1, -4.6, 1.1)
        leftArm.add(board)
      } else {
        const brolly = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.75, 11.0, 6), propDarkMat)
        brolly.rotation.x = 0.28
        brolly.position.set(0.4, -7.0, 0.8)
        rightArm.add(brolly)
      }

      bodyGroup.add(leftLeg, rightLeg, coat, scarf, head, beanie, leftArm, rightArm)

      const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat)
      hitbox.position.set(0, 17, 0)
      g.add(hitbox)
      this._registerPickable(hitbox, 'pedestrian', def.id)

      g.position.set((def.xMin + def.xMax) * 0.5, BASE_Y + 1.5, def.laneZ)
      this.root.add(g)
      this.pedestrians.push({ def, root: g, bodyGroup, leftLeg, rightLeg, leftArm, rightArm })
    }
  }

  /** Keep rooftop cat anchored cleanly if the dormitory model changes height. */
  setRoofAnchor(x, y, z) {
    this._roofOverride = { x, y, z }
    const marm = this.cats.find(c => c.def.rooftop)
    if (marm) {
      marm.baseX = x
      marm.baseY = y
      marm.baseZ = z
      marm.root.position.set(x, y, z)
    }
  }

  /** @returns {THREE.Group|null} */
  getRooftopCatGroup() {
    const marm = this.cats.find(c => c.def.rooftop)
    return marm ? marm.root : null
  }

  /** Return shallow snapshot of a cat + its current live status bars. */
  getCatSnapshot(catId) {
    const def = CAMPUS_CATS.find(c => c.id === catId)
    if (!def) return null
    const st = this._catStates.get(catId)
    return {
      ...def,
      warmth: st.warmth,
      fullness: st.fullness,
      bond: st.bond,
      moodText: st.moodText,
      petCount: st.petCount,
      feedCount: st.feedCount
    }
  }

  /** Return all campus cats with live status for listing / HUD drawer. */
  getAllCatsSnapshot() {
    return CAMPUS_CATS.map(c => this.getCatSnapshot(c.id))
  }

  /** @param {string} pedestrianId */
  getPedestrianInfo(pedestrianId) {
    return CAMPUS_PEDESTRIANS.find(p => p.id === pedestrianId) || null
  }

  /**
   * Pet or feed a campus cat and trigger a charming 3D reaction + particle puff.
   * @param {string} catId
   * @param {'pet'|'feed'} action
   */
  interactCat(catId, action) {
    const def = CAMPUS_CATS.find(c => c.id === catId)
    const st = this._catStates.get(catId)
    if (!def || !st) return null

    if (action === 'feed') {
      st.fullness = clampStat(st.fullness + 18)
      st.warmth = clampStat(st.warmth + 8)
      st.bond = clampStat(st.bond + 12)
      st.feedCount += 1
      st.moodText = def.feedLines[(st.feedCount - 1) % def.feedLines.length]
    } else {
      st.warmth = clampStat(st.warmth + 10)
      st.bond = clampStat(st.bond + 10)
      st.petCount += 1
      st.moodText = def.petLines[(st.petCount - 1) % def.petLines.length]
    }
    st.happyKind = action
    st.happyUntil = performance.now() + 2200

    const actor = this.cats.find(c => c.def.id === catId)
    if (actor && this.vfx && this.vfx.emitBurst) {
      const wp = new THREE.Vector3()
      actor.root.getWorldPosition(wp)
      wp.y += 10
      this.vfx.emitBurst(wp, action === 'feed' ? 0xffd56b : 0xff9ec0, 14, 1)
    }

    return this.getCatSnapshot(catId)
  }

  /** Trigger excited wingbeats & closer rooftop sweep during starry / winter events. */
  triggerBirdFlyby() {
    this._flockBoostUntil = performance.now() + 4500
  }

  /** @param {THREE.Raycaster} raycaster */
  raycast(raycaster) {
    if (!this.pickables.length) return null
    const hits = raycaster.intersectObjects(this.pickables, false)
    if (!hits.length) return null
    const ud = hits[0].object.userData
    if (!ud || !ud.critterKind) return null
    return { kind: ud.critterKind, id: ud.critterId, point: hits[0].point }
  }

  /** Per-frame update called from Scene.tick(). */
  update(t, paused = false) {
    if (paused) return
    const now = performance.now()

    // 1. Animated cats (gentle pacing, tail wagging, ear nods & happy hops)
    for (let i = 0; i < this.cats.length; i++) {
      const c = this.cats[i]
      const st = this._catStates.get(c.def.id)
      const happy = st && now < st.happyUntil

      if (c.def.rooftop) {
        c.root.position.y = c.baseY + (happy ? Math.abs(Math.sin(t * 7.5)) * 4.5 : Math.sin(t * 1.1) * 0.8)
        c.root.rotation.y = c.baseYaw + Math.sin(t * 0.45) * 0.25
      } else {
        // Alternate between gentle stroll and cozy sitting pause
        const cycle = (t * c.roamSpeed + i * 2.1) % (Math.PI * 2)
        const moveMix = Math.max(0, Math.sin(cycle) * 0.85)
        const offsetX = Math.sin(cycle * 0.5) * c.roamRadius * 0.65
        const offsetZ = Math.cos(cycle * 0.5) * c.roamRadius * 0.30
        const nextX = c.baseX + offsetX
        const nextZ = c.baseZ + offsetZ
        const dx = nextX - c.root.position.x
        const dz = nextZ - c.root.position.z
        if (Math.hypot(dx, dz) > 0.04) {
          c.root.rotation.y = Math.atan2(dx, dz)
        }
        c.root.position.x = nextX
        c.root.position.z = nextZ
        c.root.position.y = c.baseY + (happy ? Math.abs(Math.sin(t * 8.0)) * 5.2 : 0)

        const walkAmp = moveMix > 0.15 ? 0.34 : 0.04
        for (let l = 0; l < c.legs.length; l++) {
          const sign = (l === 0 || l === 3) ? 1 : -1
          c.legs[l].rotation.x = Math.sin(t * 5.2) * walkAmp * sign
        }
      }

      const breathe = 1 + Math.sin(t * 2.1 + i) * 0.03
      c.bodyPivot.scale.set(breathe, 1.0 - (breathe - 1.0) * 0.5, 1.0)
      c.headPivot.rotation.z = happy ? Math.sin(t * 9.0) * 0.22 : Math.sin(t * 1.2 + i) * 0.10
      c.headPivot.rotation.x = (happy && st.happyKind === 'feed') ? Math.sin(t * 10.0) * 0.18 + 0.15 : Math.sin(t * 0.9 + i) * 0.08
      const tailSpeed = happy ? 7.5 : 2.3
      c.tailBase.rotation.z = Math.sin(t * tailSpeed + i) * 0.34
      c.tailTipPivot.rotation.z = Math.sin(t * tailSpeed + i - 0.8) * 0.42
    }

    // 2. Flying twilight birds with smooth wingbeats & bank turns
    const boost = now < this._flockBoostUntil ? 1.55 : 1.0
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i]
      const { cfg } = b
      const ang = t * cfg.speed * boost + cfg.phase
      const nx = cfg.cx + Math.cos(ang) * cfg.rx
      const nz = cfg.cz + Math.sin(ang * 1.35) * cfg.rz
      const ny = cfg.y + Math.sin(ang * 2.0 + i) * 16 - (boost > 1 ? 38 : 0)

      const vx = nx - b.lastX
      const vz = nz - b.lastZ
      if (Math.hypot(vx, vz) > 0.02) {
        b.group.rotation.y = Math.atan2(vx, vz)
      }
      b.lastX = nx
      b.lastZ = nz
      b.group.position.set(nx, ny, nz)
      b.group.rotation.z = Math.sin(ang) * 0.22

      const flap = Math.sin(t * 8.4 * boost + i * 1.3) * 0.62
      b.leftWing.rotation.z = -flap
      b.rightWing.rotation.z = flap
    }

    // 3. Strolling pedestrians along sidewalk lanes (turn gently around center steps)
    for (let i = 0; i < this.pedestrians.length; i++) {
      const p = this.pedestrians[i]
      const { def } = p
      const span = Math.max(40, def.xMax - def.xMin)
      const period = (span * 2) / Math.max(6, def.speed)
      const u = ((t + def.phase * 11) % period) / period
      const forward = u < 0.5
      const frac = forward ? u * 2 : (1 - u) * 2
      // Smooth hermite easing near turning points so turnaround feels natural
      const eased = frac * frac * (3 - 2 * frac)
      const x = def.xMin + span * eased
      // Curve smoothly outward when passing center entrance zebra zone (|x| < 120)
      const centerArc = Math.exp(-(x * x) / (115 * 115)) * 11
      const z = def.laneZ + centerArc

      p.root.position.set(x, BASE_Y + 1.5, z)
      p.root.rotation.y = forward ? Math.PI * 0.5 : -Math.PI * 0.5

      const stride = Math.sin(t * 5.2 + i * 1.7) * 0.42
      p.leftLeg.rotation.x = stride
      p.rightLeg.rotation.x = -stride
      p.leftArm.rotation.x = -stride * 0.65
      p.rightArm.rotation.x = stride * 0.55
      p.bodyGroup.position.y = Math.abs(Math.cos(t * 5.2 + i * 1.7)) * 0.65
    }
  }

  dispose() {
    const geoms = new Set()
    const mats = new Set()
    this.root.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        if (obj.geometry) geoms.add(obj.geometry)
        if (Array.isArray(obj.material)) obj.material.forEach(m => m && mats.add(m))
        else if (obj.material) mats.add(obj.material)
      }
    })
    for (const g of geoms) g.dispose()
    for (const m of mats) m.dispose()
    if (this.root.parent) this.root.parent.remove(this.root)
    this.pickables = []
    this.cats = []
    this.birds = []
    this.pedestrians = []
  }
}

// Dynamic NPC portrait & weather-outfit renderer + campus dialogue library.
//
// Every character switches outfit and prop based on current (weather, season):
//   rain_gear     -> yellow/translucent hooded raincoat + open umbrella + droplets
//   winter_puffer -> quilted winter puffer + knit earflap beanie + scarf + thermos
//   fog_coat      -> high-collar windbreaker trench + glowing flashlight beam
//   autumn_knit   -> cozy sweater cardigan + plaid scarf
//   sunny_light   -> short-sleeve duty uniform / shirt

import { dormDef, outfitForEnv, seasonDef } from '../shared/constants.js'

/**
 * @typedef {{
 *   id: string, name: string, role: string, badge: string,
 *   skin: string, hair: string, hairStyle: 'bun'|'short_part'|'cap'|'bob'|'band'|'messy'|'glasses_bob'|'spiky',
 *   shirtColor: string, glasses?: boolean, mustache?: boolean, propHint: string
 * }} NpcMeta
 *
 * @type {Record<string, NpcMeta>}
 */
export const NPC_CATALOG = {
  aunt_lin: {
    id: 'aunt_lin', name: '林阿姨', role: '宿管值班员', badge: '宿管',
    skin: '#f6d1b6', hair: '#4a3531', hairStyle: 'bun', shirtColor: '#4c708a',
    glasses: true, propHint: '热红枣茶与钥匙串'
  },
  dean_zhou: {
    id: 'dean_zhou', name: '周副校长', role: '夜巡校领导', badge: '校领导',
    skin: '#ebc2a3', hair: '#383d4c', hairStyle: 'short_part', shirtColor: '#3a465e',
    glasses: true, mustache: true, propHint: '巡查记录本'
  },
  uncle_wang: {
    id: 'uncle_wang', name: '王师傅', role: '后勤电工', badge: '维修',
    skin: '#e2b18d', hair: '#302b28', hairStyle: 'cap', shirtColor: '#4d6b52',
    propHint: '电工工具包'
  },
  xiaohe: {
    id: 'xiaohe', name: '小禾', role: '203 插画系', badge: '住户',
    skin: '#fae0c8', hair: '#52342c', hairStyle: 'bob', shirtColor: '#c9725c',
    propHint: '彩铅速写本'
  },
  ache: {
    id: 'ache', name: '阿澈', role: '205 校园广播站', badge: '主播',
    skin: '#f4cfb4', hair: '#2a2e3e', hairStyle: 'band', shirtColor: '#566494',
    propHint: '复古麦与耳机'
  },
  aman: {
    id: 'aman', name: '阿满', role: '301 夜宵合伙人', badge: '住户',
    skin: '#f1c7a4', hair: '#3d2a22', hairStyle: 'messy', shirtColor: '#d48d44',
    propHint: '关东煮小电锅'
  },
  zhixia: {
    id: 'zhixia', name: '知夏', role: '304 考研学姐', badge: '住户',
    skin: '#f8dcc4', hair: '#282534', hairStyle: 'glasses_bob', shirtColor: '#766492',
    glasses: true, propHint: '流浪橘猫与笔记'
  },
  xingye: {
    id: 'xingye', name: '星野', role: '406 天文社', badge: '住户',
    skin: '#f5d2b8', hair: '#242b42', hairStyle: 'spiky', shirtColor: '#3b647a',
    propHint: '黄铜望远镜'
  }
}

export const OUTFIT_LABELS = {
  rain_gear: '雨衣 · 撑伞装',
  winter_puffer: '羽绒服 · 保暖装',
  fog_coat: '防风衣 · 手电巡夜装',
  autumn_knit: '毛衣 · 格子围巾装',
  sunny_light: '轻便值班常服'
}

/**
 * Render an expressive, Stardew-meets-painterly layered SVG portrait for an NPC,
 * adapting clothing, outerwear, accessories and backdrop to weather & season.
 *
 * @param {string} npcId
 * @param {string} [weather]
 * @param {string} [season]
 * @returns {string} inline SVG string
 */
export function renderNpcPortraitSvg(npcId, weather = 'clear', season = 'autumn') {
  const npc = NPC_CATALOG[npcId] || NPC_CATALOG.aunt_lin
  const outfit = outfitForEnv(weather, season)

  // Backdrop hue by weather/season
  const bgA = weather === 'light_rain' ? '#1e2c4d' : weather === 'fog' ? '#2c334b' : season === 'spring' ? '#2c2444' : '#182442'
  const bgB = weather === 'light_rain' ? '#3d486a' : weather === 'fog' ? '#63718e' : season === 'autumn' ? '#5e4338' : '#2d4674'

  // Outerwear SVG by outfit
  let torso = ''
  let headwear = ''
  let prop = ''
  let fx = ''

  if (outfit === 'rain_gear') {
    const coat = npcId === 'dean_zhou' ? '#3c6896' : '#eab64a'
    const shade = npcId === 'dean_zhou' ? '#2b4d70' : '#c98e2c'
    torso = `<path d="M18 118 C20 82 32 74 50 74 C68 74 80 82 82 118 Z" fill="${coat}" stroke="#231914" stroke-width="2.2"/>
      <path d="M50 74 L50 118" stroke="${shade}" stroke-width="2.2"/>
      <path d="M27 78 Q50 86 73 78 L70 68 Q50 74 30 68 Z" fill="${shade}" stroke="#231914" stroke-width="1.8"/>`
    // Umbrella behind shoulder
    prop = `<path d="M62 28 Q84 12 96 34 Q82 32 74 35 Q67 32 62 28 Z" fill="#ffd26a" stroke="#231914" stroke-width="2"/>
      <line x1="78" y1="26" x2="75" y2="96" stroke="#423228" stroke-width="2.4" stroke-linecap="round"/>`
    fx = `<circle cx="22" cy="24" r="1.5" fill="#bfe2ff" opacity="0.75"/>
      <circle cx="88" cy="54" r="1.6" fill="#bfe2ff" opacity="0.75"/>
      <circle cx="14" cy="64" r="1.3" fill="#bfe2ff" opacity="0.65"/>`
  } else if (outfit === 'winter_puffer') {
    const coat = npcId === 'dean_zhou' ? '#2e3a52' : npcId === 'aunt_lin' ? '#9e4747' : '#4a7066'
    torso = `<path d="M15 118 C16 80 30 72 50 72 C70 72 84 80 85 118 Z" fill="${coat}" stroke="#1c1514" stroke-width="2.2"/>
      <path d="M22 92 Q50 96 78 92 M20 105 Q50 109 80 105" stroke="rgba(255,255,255,0.22)" stroke-width="2" fill="none"/>
      <path d="M31 72 Q50 84 69 72 Q72 82 65 86 Q50 92 35 86 Q28 82 31 72 Z" fill="#e66b58" stroke="#1c1514" stroke-width="1.8"/>
      <rect x="52" y="83" width="10" height="22" rx="3" fill="#d45848" stroke="#1c1514" stroke-width="1.6"/>`
    headwear = `<path d="M28 36 C28 18 72 18 72 36 Z" fill="#d96b52" stroke="#1c1514" stroke-width="2"/>
      <circle cx="50" cy="17" r="5" fill="#f7ebd2" stroke="#1c1514" stroke-width="1.8"/>`
    prop = `<rect x="70" y="90" width="14" height="19" rx="3" fill="#e8dcc4" stroke="#1c1514" stroke-width="1.8"/>
      <path d="M74 84 Q72 78 76 74 M80 84 Q78 78 82 74" stroke="#ffffff" stroke-width="1.6" fill="none" opacity="0.7" stroke-linecap="round"/>`
    fx = `<circle cx="18" cy="24" r="2.2" fill="#ffffff" opacity="0.75"/>
      <circle cx="84" cy="36" r="1.8" fill="#ffffff" opacity="0.65"/>`
  } else if (outfit === 'fog_coat') {
    const trench = npcId === 'dean_zhou' ? '#2c3546' : '#7b6852'
    torso = `<path d="M18 118 C20 82 32 74 50 74 C68 74 80 82 82 118 Z" fill="${trench}" stroke="#1c1514" stroke-width="2.2"/>
      <path d="M35 72 L45 92 L50 84 L55 92 L65 72" fill="#5e4e3c" stroke="#1c1514" stroke-width="1.8"/>`
    // Glowing flashlight held up
    prop = `<polygon points="78,74 100,52 100,90" fill="rgba(255,224,140,0.28)"/>
      <rect x="66" y="72" width="14" height="7" rx="2" fill="#3a3f4a" stroke="#1c1514" stroke-width="1.6"/>
      <circle cx="80" cy="75.5" r="3" fill="#ffe599"/>`
    fx = `<ellipse cx="50" cy="108" rx="44" ry="12" fill="rgba(210,224,248,0.20)"/>`
  } else if (outfit === 'autumn_knit') {
    torso = `<path d="M19 118 C21 83 33 74 50 74 C67 74 79 83 81 118 Z" fill="${npc.shirtColor}" stroke="#1c1514" stroke-width="2.2"/>
      <path d="M36 74 L50 94 L64 74" fill="#f2e4cc" stroke="#1c1514" stroke-width="1.6"/>
      <path d="M32 73 Q50 84 68 73 Q68 82 50 86 Q32 82 32 73 Z" fill="#c85a48" stroke="#1c1514" stroke-width="1.8"/>`
    fx = `<path d="M82 28 Q88 22 86 32 Q80 33 82 28 Z" fill="#e69a45" opacity="0.85"/>`
  } else {
    torso = `<path d="M20 118 C22 84 34 75 50 75 C66 75 78 84 80 118 Z" fill="${npc.shirtColor}" stroke="#1c1514" stroke-width="2.2"/>
      <path d="M40 75 L50 87 L60 75" fill="#f7eedb" stroke="#1c1514" stroke-width="1.6"/>`
  }

  // Hair variations
  let hairBack = ''
  let hairFront = ''
  if (npc.hairStyle === 'bun') {
    hairBack = `<circle cx="50" cy="20" r="10" fill="${npc.hair}" stroke="#1c1514" stroke-width="2"/>`
    hairFront = `<path d="M29 44 C29 24 71 24 71 44 C66 34 55 32 50 36 C45 32 34 34 29 44 Z" fill="${npc.hair}" stroke="#1c1514" stroke-width="1.8"/>`
  } else if (npc.hairStyle === 'bob' || npc.hairStyle === 'glasses_bob') {
    hairBack = `<path d="M26 42 C24 22 76 22 74 42 L76 66 L24 66 Z" fill="${npc.hair}" stroke="#1c1514" stroke-width="2"/>`
    hairFront = `<path d="M28 40 C30 25 70 25 72 40 Q58 34 50 40 Q42 34 28 40 Z" fill="${npc.hair}"/>`
  } else {
    hairFront = `<path d="M28 42 C28 22 72 22 72 42 C66 32 56 31 50 35 C42 30 33 33 28 42 Z" fill="${npc.hair}" stroke="#1c1514" stroke-width="1.8"/>`
  }

  const glassesSvg = npc.glasses
    ? `<rect x="34" y="45" width="13" height="9" rx="3" fill="rgba(255,255,255,0.18)" stroke="#2c2420" stroke-width="1.7"/>
       <rect x="53" y="45" width="13" height="9" rx="3" fill="rgba(255,255,255,0.18)" stroke="#2c2420" stroke-width="1.7"/>
       <line x1="47" y1="49" x2="53" y2="49" stroke="#2c2420" stroke-width="1.7"/>`
    : ''

  const mustacheSvg = npc.mustache
    ? `<path d="M42 60 Q50 56 58 60" stroke="#363238" stroke-width="2.6" stroke-linecap="round" fill="none"/>`
    : ''

  return `<svg viewBox="0 0 100 118" width="96" height="114" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${npc.name}">
    <defs>
      <linearGradient id="bg_${npc.id}_${outfit}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${bgA}"/><stop offset="100%" stop-color="${bgB}"/>
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="96" height="114" rx="14" fill="url(#bg_${npc.id}_${outfit})" stroke="rgba(255,214,150,0.45)" stroke-width="2"/>
    ${prop}
    ${hairBack}
    ${torso}
    <rect x="44" y="64" width="12" height="14" rx="4" fill="${npc.skin}" stroke="#1c1514" stroke-width="1.6"/>
    <ellipse cx="50" cy="48" rx="20" ry="22" fill="${npc.skin}" stroke="#1c1514" stroke-width="2"/>
    ${hairFront}
    ${headwear}
    <circle cx="41" cy="49" r="2.2" fill="#1e1714"/>
    <circle cx="59" cy="49" r="2.2" fill="#1e1714"/>
    <ellipse cx="36" cy="54" rx="3.2" ry="1.8" fill="rgba(235,120,110,0.45)"/>
    <ellipse cx="64" cy="54" rx="3.2" ry="1.8" fill="rgba(235,120,110,0.45)"/>
    ${glassesSvg}
    ${mustacheSvg}
    <path d="M44 61 Q50 65 56 61" stroke="#6c3a2c" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    ${fx}
  </svg>`
}

/**
 * Offline deterministic opening dialogue tailored to dormType + season + weather.
 * @param {string} dormType
 * @param {string} season
 * @param {string} weather
 */
export function buildOfflineDialogue(dormType, season, weather) {
  const dorm = dormDef(dormType)
  const seas = seasonDef(season)
  const outfit = outfitForEnv(weather, season)

  const envLine = {
    rain_gear: `林阿姨刚把黄雨衣抖落水珠、撑开门口那把大黄伞，朝你招了招手。`,
    winter_puffer: `寒风卷着雪粒，周副校长把厚棉服领子竖高了些，递过来一杯热腾腾的姜茶。`,
    fog_coat: `夜雾顺着草坪漫了过来，林阿姨拧亮手电筒光柱，照出石板路边的小水洼。`,
    autumn_knit: `晚风吹动格子围巾，${seas.name}的落叶刚好飘过值班室窗台。`,
    sunny_light: `${seas.name}的夜风很清透，星空刚好落在${dorm.shortName}的屋檐上方。`
  }[outfit]

  const dormFlavor = {
    highschool: '今天轮到巡查高中晨光楼，晚自习十点半刚结束，总有同学想躲被窝再背两页书。',
    university: '今晚重点关照 17 号大学宿舍楼——二十四扇窗里藏着画画的、熬夜打游戏的、还有蹲窗台的橘猫。',
    grad: '研究生研思楼一共三十扇窗，刚从实验室回来的学长学姐们常常忘了几点该拉灯休息。',
    staff: '教职工桂花院最安静，十二扇宽窗后是热牛奶、书桌和晚归的灯光，记得温柔点亮引路哦。'
  }[dorm.id] || '今晚我们一起沿着宿舍楼巡查一圈，记住熬夜亮灯的房间，温柔提醒大家按时熄灯助眠。'

  return {
    lines: [
      { speakerId: 'aunt_lin', line: `${envLine}「小夜巡员，今晚咱俩在${dorm.name}搭班值守！」` },
      { speakerId: 'dean_zhou', line: `「${dormFlavor}」` },
      { speakerId: 'aunt_lin', line: '「记住规则：等全楼熄灯信号扫过，按记忆点出还亮着灯的寝室，帮大家安稳睡个好觉！」' }
    ],
    choices: [
      { label: '我记性好，先查依次亮灯', buffType: 'extra_shield', buffLabel: '护盾 +1 容错' },
      { label: '直接开始巡楼！', buffType: 'score_boost', buffLabel: '首关得分 +25%' }
    ]
  }
}

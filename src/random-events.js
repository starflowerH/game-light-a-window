// Campus random events engine for v4.0 minigames.
//
// Events trigger periodically between or inside stages, pairing an expressive
// NPC bubble (dressed for the live weather/season) with a tangible gameplay
// modifier (shield heal, score multiplier, extra observe time, free hint, etc.).

export const RANDOM_EVENTS = [
  {
    id: 'evt_dean_inspect',
    title: '校领导突击陪巡',
    speakerId: 'dean_zhou',
    line: '「小同学记性真稳！这轮本校长给你加盖表扬章，得分 1.5 倍！」',
    effect: 'score_mult_1_5',
    badge: '得分 ×1.5'
  },
  {
    id: 'evt_aunt_tea',
    title: '宿管送来热红枣茶',
    speakerId: 'aunt_lin',
    line: '「慢一点不打紧，喝口热茶暖暖手，阿姨给你多补一颗星灯护盾！」',
    effect: 'heal_shield',
    badge: '护盾 +1'
  },
  {
    id: 'evt_power_flicker',
    title: '老楼电路瞬时稳压',
    speakerId: 'uncle_wang',
    line: '「刚检修完总闸！这关阿姨给你多留半秒看灯时间，看清楚再点！」',
    effect: 'extra_observe_ms',
    badge: '展示时间 +0.7s'
  },
  {
    id: 'evt_cat_window',
    title: '流浪橘猫踩中窗台',
    speakerId: 'zhixia',
    line: '「喵~ 304 的橘猫突然跳上一扇目标窗台！这一户就不用你自己记啦。」',
    effect: 'auto_reveal_one',
    badge: '自动提示 1 窗'
  },
  {
    id: 'evt_meteor_wish',
    title: '天台水塔流星划过',
    speakerId: 'xingye',
    line: '「快看屋顶！双子座流星划过去了，本关额外加 120 幸运分！」',
    effect: 'bonus_120',
    badge: '幸运 +120 分'
  },
  {
    id: 'evt_midnight_snack',
    title: '301 宿舍深夜煮面飘香',
    speakerId: 'aman',
    line: '「嘘——谁闻到关东煮热气了？顺手给隔壁也加个温暖小彩蛋！」',
    effect: 'bonus_80',
    badge: '夜宵 +80 分'
  },
  {
    id: 'evt_radio_bgm',
    title: '205 晚安电台调频接通',
    speakerId: 'ache',
    line: '「大家戴上耳机听这段钢琴尾奏，连击加分更顺手。」',
    effect: 'combo_plus_2',
    badge: '连击 +2'
  },
  {
    id: 'evt_sketch_note',
    title: '203 速写本夹着楼层暗号',
    speakerId: 'xiaohe',
    line: '「我把刚才那扇窗的光影画在纸角了，多给你延长 5 秒思考时间。」',
    effect: 'extra_recall_sec',
    badge: '思考 +5s'
  }
]

/**
 * Pick a random campus event weighted slightly toward helpful ones when shields are low.
 * @param {number} shields
 * @param {() => number} [rng]
 */
export function pickRandomEvent(shields = 3, rng = Math.random) {
  if (shields <= 1 && rng() < 0.45) {
    return RANDOM_EVENTS[1] // Aunt Lin's hot tea heal
  }
  return RANDOM_EVENTS[Math.floor(rng() * RANDOM_EVENTS.length)]
}

// 17号宿舍楼群像剧本图谱（offline narrative graph）.
//
// Everything in this file is deterministic and dependency-free so it can act as
// the always-available fallback for all four AI agents. When the network or the
// upstream model fails, the game still gets a complete, hand-written three-night
// story with real branching and six endings.
//
// Six residents carry a three-night state machine:
//   nights[0]                         -> first meeting, 2 choices
//   nights[1].variants[A|B]           -> night 2, keyed by the night-1 choice
//   nights[2].variants[A|B]           -> night 3, keyed by the night-2 choice
// The 18 non-core windows draw from a pool of campus slices.

import {
  CORE_RESIDENT_ROOMS,
  DEFAULT_COMMISSIONS,
  ENDING_BY_ID,
  ENDINGS,
  INDEX_TO_ROOM,
  MOOD_TOKENS,
  endingMeta,
  moodToken,
  roomIdForIndex
} from '../shared/constants.js'

/** @typedef {{ id: 'A'|'B', label: string, outcome: string }} Choice */
/** @typedef {{ text: string, choices: Choice[] }} StoryNode */
/** @typedef {{ variants: Record<'A'|'B', StoryNode> }} BranchNode */

/**
 * @typedef {{
 *   roomId: number,
 *   name: string,
 *   role: string,
 *   resident: string,
 *   icon: string,
 *   item: string,
 *   items: string[],
 *   silhouette: string,
 *   bond: string,
 *   nights: [StoryNode, BranchNode, BranchNode]
 * }} Resident
 */

/** @type {Resident[]} */
export const RESIDENTS = [
  {
    roomId: 102,
    name: '林阿姨',
    role: '宿管值班室',
    resident: '林阿姨 · 102室',
    icon: '☕',
    item: '黄铜钥匙',
    items: ['黄铜钥匙', '保温茶缸'],
    silhouette: 'duty',
    bond: '一楼那盏总也不灭的灯',
    nights: [
      {
        text: '熄灯铃响过很久，林阿姨还对着名单核对晚归的人，保温桶里温着红枣茶。',
        choices: [
          { id: 'A', label: '添一分暖光', outcome: '门口的路灯亮了一格，远远就能看见回去的路。' },
          { id: 'B', label: '留一份安静', outcome: '值班台的灯柔和下来，她终于靠回了藤椅。' }
        ]
      },
      {
        variants: {
          A: {
            text: '晚归的学生在窗口接过一杯热茶，黄铜钥匙串轻轻响了一声。',
            choices: [
              { id: 'A', label: '再添一把椅子', outcome: '门廊下多了一把旧木椅，谁都能坐一会儿。' },
              { id: 'B', label: '把茶换成姜汤', outcome: '保温桶里换了姜汤，热气一直飘到楼梯口。' }
            ]
          },
          B: {
            text: '林阿姨披着毛衣在藤椅上打盹，收音机里放着很慢的老歌。',
            choices: [
              { id: 'A', label: '替她关掉收音机', outcome: '最后一个音符落下去，值班室安静得能听见钟走。' },
              { id: 'B', label: '留一首歌给她', outcome: '歌声继续，她在梦里跟着哼了半句。' }
            ]
          }
        }
      },
      {
        variants: {
          A: {
            text: '102 是全楼最早亮起的窗。门廊下靠着一把黄伞，伞柄上系了张纸条：谁都能借。',
            choices: [
              { id: 'A', label: '把伞撑开晾着', outcome: '伞面在门灯下慢慢干了，像一小片黄色的屋顶。' },
              { id: 'B', label: '在名单上画个圈', outcome: '最后一个名字后面，被轻轻圈了一下。' }
            ]
          },
          B: {
            text: '值班表的最后一格画了个小小的圈，她摘下老花镜，灯还留着没关。',
            choices: [
              { id: 'A', label: '留一盏门灯', outcome: '门灯亮了一整夜，没有为谁熄过。' },
              { id: 'B', label: '把茶缸洗干净', outcome: '搪瓷缸倒扣在窗台，水珠慢慢滑下去。' }
            ]
          }
        }
      }
    ]
  },
  {
    roomId: 203,
    name: '小禾',
    role: '插画系大二生',
    resident: '小禾 · 203室',
    icon: '🪴',
    item: '手绘速写本',
    items: ['手绘速写本', '窗台绿萝'],
    silhouette: 'easel',
    bond: '画纸上那栋会发光的楼',
    nights: [
      {
        text: '小禾对着画板叹了口气，把画废的速写纸揉成团，又舍不得扔。',
        choices: [
          { id: 'A', label: '照亮窗台绿萝', outcome: '光落在刚冒出的新叶上，她盯着看了一会儿。' },
          { id: 'B', label: '连向三楼窗光', outcome: '楼上的暖光斜下来，在纸上铺了一小块金色。' }
        ]
      },
      {
        variants: {
          A: {
            text: '画板上的废稿被改成了一盆绿萝，旁边多了一杯不知道谁放的热牛奶。',
            choices: [
              { id: 'A', label: '把牛奶推近一点', outcome: '杯壁的水汽在纸上洇开一小圈，正好是叶子的形状。' },
              { id: 'B', label: '添一片新叶', outcome: '绿萝又冒了一片叶子，她把这一天记在了角落的日期旁。' }
            ]
          },
          B: {
            text: '她在速写本上画下了整栋发光的宿舍楼，楼顶留了一小片空白。',
            choices: [
              { id: 'A', label: '补上楼顶的月亮', outcome: '空白处多了一轮很淡的月亮，刚好照亮屋脊。' },
              { id: 'B', label: '留白不画', outcome: '她说空着也挺好，反正明天还能接着画。' }
            ]
          }
        }
      },
      {
        variants: {
          A: {
            text: '她把画好的《今晚亮灯的17号楼》贴在窗玻璃上，正好成了明信片的底稿。',
            choices: [
              { id: 'A', label: '帮她按平边角', outcome: '纸角服帖地贴在玻璃上，从楼下看像真的亮着。' },
              { id: 'B', label: '在画角落签个名', outcome: '角落写下了一个小小的日期，和你的名字。' }
            ]
          },
          B: {
            text: '速写本摊在窗台上，最后一页是空的，只写了两个字：明天。',
            choices: [
              { id: 'A', label: '替她翻到下一页', outcome: '下一页是干净的纸，笔已经削好了。' },
              { id: 'B', label: '把那页留着', outcome: '空白的纸在灯下泛着一点暖色，也很好看。' }
            ]
          }
        }
      }
    ]
  },
  {
    roomId: 205,
    name: '阿澈',
    role: '校园广播站主播',
    resident: '阿澈 · 205室',
    icon: '🎧',
    item: '旧耳麦',
    items: ['旧耳麦', '折纸船'],
    silhouette: 'mic',
    bond: '毕业前最后一期夜话',
    nights: [
      {
        text: '广播站早就闭台了，阿澈还在宿舍里用很小的音量录最后一期毕业夜话。',
        choices: [
          { id: 'A', label: '调高晚风共鸣', outcome: '他的声音顺着窗缝飘上去，四楼有人跟着哼了一句。' },
          { id: 'B', label: '点亮桌上台灯', outcome: '他把最后一封听众来信读完，折好压在杯子下面。' }
        ]
      },
      {
        variants: {
          A: {
            text: '四楼的吉他声顺着风飘下来，成了他这期节目的背景乐。',
            choices: [
              { id: 'A', label: '把吉他收进来', outcome: '两个声音叠在一起，像一间屋子里有两个人。' },
              { id: 'B', label: '让风声也进来', outcome: '窗开了一条缝，耳机里多了整栋楼的呼吸。' }
            ]
          },
          B: {
            text: '他把没念完的信折成一只纸船，放在窗台上，耳麦的红灯还亮着。',
            choices: [
              { id: 'A', label: '给纸船一点光', outcome: '船身被照得透亮，像随时能顺着夜色漂走。' },
              { id: 'B', label: '把红灯按灭', outcome: '红灯暗下去，他摘下耳机，长长地舒了一口气。' }
            ]
          }
        }
      },
      {
        variants: {
          A: {
            text: '最后一段晚安电波在整栋楼里回荡，每一扇亮着的窗都成了它的音箱。',
            choices: [
              { id: 'A', label: '把音量留着', outcome: '电波在楼里绕了一圈，慢慢淡下去，没有人关掉。' },
              { id: 'B', label: '说一句晚安', outcome: '他在话筒前停了两秒，说：晚安，17号楼。' }
            ]
          },
          B: {
            text: '纸船搁在窗台上没走，他在旁边压了一枚硬币，像是买了一张船票。',
            choices: [
              { id: 'A', label: '替他把窗推开', outcome: '风进来，纸船晃了晃，还是稳稳停在原地。' },
              { id: 'B', label: '留着这枚硬币', outcome: '硬币在灯下反着光，像一枚小小的月亮。' }
            ]
          }
        }
      }
    ]
  },
  {
    roomId: 301,
    name: '阿满',
    role: '夜宵合伙人',
    resident: '阿满与室友 · 301室',
    icon: '🍢',
    item: '关东煮',
    items: ['关东煮', '白球鞋'],
    silhouette: 'hotpot',
    bond: '一锅偷偷煮的夜宵',
    nights: [
      {
        text: '走廊尽头的洗衣机还在转，301 偷偷煮了一锅热腾腾的关东煮。',
        choices: [
          { id: 'A', label: '分一串萝卜', outcome: '玻璃上哈出一朵笑脸，隔壁的人端着碗过来了。' },
          { id: 'B', label: '帮他们遮掩', outcome: '窗帘合拢，只漏出一条暖暖的橘色。' }
        ]
      },
      {
        variants: {
          A: {
            text: '窗台上排了一排洗干净的玻璃杯，隔壁室友也来蹭汤了。',
            choices: [
              { id: 'A', label: '再添一双筷子', outcome: '抽屉里翻出第四双筷子，谁也没问是谁的。' },
              { id: 'B', label: '把汤再热一遍', outcome: '锅盖一掀，白汽糊住了整块玻璃。' }
            ]
          },
          B: {
            text: '四个人围着一盏充电小台灯讲冷笑话，肩膀一抖一抖。',
            choices: [
              { id: 'A', label: '把台灯调亮一格', outcome: '光圈变大，四张脸都被照得亮亮的。' },
              { id: 'B', label: '让笑声小一点', outcome: '笑声压得很低，反而更好笑了。' }
            ]
          }
        }
      },
      {
        variants: {
          A: {
            text: '窗台上摆满了大大小小的马克杯，像一排不会熄灭的小火苗。',
            choices: [
              { id: 'A', label: '把杯子摆齐', outcome: '一排杯子从大到小，像一列小小的路灯。' },
              { id: 'B', label: '留一只空杯', outcome: '最右边空着一只，说是留给今晚路过的人。' }
            ]
          },
          B: {
            text: '小电锅收进了柜子，窗台上只剩两只洗干净的碗，倒扣着晾水。',
            choices: [
              { id: 'A', label: '把碗擦干', outcome: '碗底的水痕被擦掉，露出很好看的青花。' },
              { id: 'B', label: '留着明晚再用', outcome: '碗就那样放着，好像明晚一定会再来一次。' }
            ]
          }
        }
      }
    ]
  },
  {
    roomId: 304,
    name: '知夏',
    role: '考研二战学姐',
    resident: '知夏 · 304室',
    icon: '📚',
    item: '橘猫胡须',
    items: ['橘猫胡须', '荧光笔'],
    silhouette: 'books',
    bond: '书堆和窗外的橘猫',
    nights: [
      {
        text: '知夏揉了揉发酸的眼睛，窗外空调机上蹲着那只常来的流浪橘猫。',
        choices: [
          { id: 'A', label: '推开半扇窗', outcome: '橘猫抖了抖毛跳进来，趴在她的错题本边上。' },
          { id: 'B', label: '温一杯热牛奶', outcome: '台灯的光圈刚好罩住翻开的那一页。' }
        ]
      },
      {
        variants: {
          A: {
            text: '橘猫正大光明地趴在政治笔记上打呼噜，她笑着没有赶它走。',
            choices: [
              { id: 'A', label: '给它留个位置', outcome: '书桌右上角从此空出一小块，铺了条旧毛巾。' },
              { id: 'B', label: '把笔记抽出来', outcome: '猫翻了个身，爪子还搭在书角上。' }
            ]
          },
          B: {
            text: '书堆矮了一截，她在日历上轻轻画了一个漂亮的勾。',
            choices: [
              { id: 'A', label: '再画一个勾', outcome: '两个勾并排站着，像两个人一起点头。' },
              { id: 'B', label: '把日历翻到明天', outcome: '明天的格子里已经写好了要看的页数。' }
            ]
          }
        }
      },
      {
        variants: {
          A: {
            text: '知夏提前十分钟合上了书，抱着橘猫在窗边看月亮。',
            choices: [
              { id: 'A', label: '陪她看一会儿', outcome: '月亮从楼角挪到树梢，谁也没说话。' },
              { id: 'B', label: '把台灯关掉', outcome: '只剩月光，猫的眼睛在暗处亮了一下。' }
            ]
          },
          B: {
            text: '她把最后一套卷子收进抽屉，牛奶杯底还剩一口温的。',
            choices: [
              { id: 'A', label: '替她把杯子收走', outcome: '杯底那一口她喝了，说刚好不烫。' },
              { id: 'B', label: '留着那盏台灯', outcome: '灯没关，她靠在椅背上闭了会儿眼睛。' }
            ]
          }
        }
      }
    ]
  },
  {
    roomId: 406,
    name: '星野',
    role: '天文社守望者',
    resident: '星野 · 406室',
    icon: '🔭',
    item: '黄铜星图',
    items: ['黄铜星图', '半块月亮'],
    silhouette: 'telescope',
    bond: '水塔边等流星的位置',
    nights: [
      {
        text: '顶楼 406 的少年把望远镜对准云层缝隙，等十一点半的双子座流星。',
        choices: [
          { id: 'A', label: '吹散头顶薄云', outcome: '云缝裂开一条，望远镜里的星星忽然清晰了。' },
          { id: 'B', label: '呼唤屋顶的猫', outcome: '水塔边探出一个黑脑袋，尾巴慢慢地摆。' }
        ]
      },
      {
        variants: {
          A: {
            text: '望远镜捕捉到了第一颗划过远山的流星，他激动地朝楼下挥手。',
            choices: [
              { id: 'A', label: '替他把星记下来', outcome: '星图上多了一个很小的叉，旁边写了时间。' },
              { id: 'B', label: '再许一个愿', outcome: '他闭上眼睛，睫毛在镜筒上投了一小片影子。' }
            ]
          },
          B: {
            text: '他顺着楼梯爬上天台，在水塔旁放飞了一盏许愿河灯。',
            choices: [
              { id: 'A', label: '让灯飘高一点', outcome: '河灯越过栏杆，慢慢变成一颗很低的星。' },
              { id: 'B', label: '把黑猫也带上去', outcome: '猫蹲在水塔边，和河灯一起抬头看天。' }
            ]
          }
        }
      },
      {
        variants: {
          A: {
            text: '星野把望远镜转向整栋楼，说从上面看，每一扇窗都是一颗星星。',
            choices: [
              { id: 'A', label: '数一数有几颗', outcome: '他数到二十四就停了，说再多就数不清了。' },
              { id: 'B', label: '让他看久一点', outcome: '镜筒慢慢转了一圈，把整栋楼收进眼里。' }
            ]
          },
          B: {
            text: '天台的水塔旁边多了一块小石头，压着一张写满星名的纸。',
            choices: [
              { id: 'A', label: '把纸压稳', outcome: '风掀了两次，纸角终于服帖了。' },
              { id: 'B', label: '在纸上添一颗', outcome: '最后一颗星没有名字，他写：今晚的灯。' }
            ]
          }
        }
      }
    ]
  }
]

/** @type {Record<number, Resident>} */
export const RESIDENT_BY_ROOM = Object.fromEntries(RESIDENTS.map(r => [r.roomId, r]))

/** The room each resident's artwork should use as a silhouette. */
export const RESIDENT_SILHOUETTES = Object.fromEntries(RESIDENTS.map(r => [r.roomId, r.silhouette]))

/**
 * @param {number} roomId
 * @returns {Resident | null}
 */
export function residentForRoom(roomId) {
  return RESIDENT_BY_ROOM[roomId] || null
}

/**
 * Resolve the story node for one resident on one night.
 *
 * @param {number} roomId
 * @param {number} nightIndex 0-based
 * @param {'A'|'B'|null} priorChoice the choice made on the previous night
 * @returns {StoryNode | null}
 */
export function residentStory(roomId, nightIndex, priorChoice) {
  const res = RESIDENT_BY_ROOM[roomId]
  if (!res) return null
  const node = res.nights[Math.max(0, Math.min(2, nightIndex))]
  if (!node) return null
  if ('text' in node) return node
  const variant = node.variants[priorChoice || 'A'] || node.variants.A
  return variant || null
}

/**
 * The full three-night plan for one resident, used by the offline builder and
 * by the tests that assert every resident has a complete arc.
 *
 * @param {number} roomId
 * @returns {Array<{ night: number, text: string, choices: Choice[] }>}
 */
export function residentArc(roomId) {
  const out = []
  for (let n = 0; n < 3; n++) {
    const a = residentStory(roomId, n, 'A')
    out.push({ night: n + 1, text: a ? a.text : '', choices: a ? a.choices : [] })
  }
  return out
}

// ---------------------------------------------------------------------------
// Flowing windows · campus slices
// ---------------------------------------------------------------------------

/**
 * Short slices of dorm life for the 18 non-core windows.
 * @type {Array<{ roomId: number, text: string, item: string, icon: string }>}
 */
export const FLOWING_STORIES = [
  { roomId: 101, text: '一楼窗台的球鞋摆得整整齐齐，鞋尖都朝着门。', item: '白球鞋', icon: '👟' },
  { roomId: 103, text: '有人在窗边给家里打电话，声音压得很低，笑了两次。', item: '旧手机', icon: '📖' },
  { roomId: 104, text: '晾衣杆上挂着一条没拧干的毛巾，滴水滴得很慢。', item: '蓝毛巾', icon: '✦' },
  { roomId: 105, text: '桌上摊着一本没写完的实验报告，笔帽没盖。', item: '签字笔', icon: '✏' },
  { roomId: 106, text: '窗内飘出泡面的味道，热气在玻璃上糊了一小块白。', item: '泡面碗', icon: '🍜' },
  { roomId: 201, text: '有人把行李箱立在门后，拉链上还挂着机场的牌。', item: '行李牌', icon: '✦' },
  { roomId: 202, text: '窗台上一盆多肉被浇多了水，叶子鼓鼓的。', item: '多肉', icon: '🪴' },
  { roomId: 204, text: '吉他靠在墙上，弦上夹着一张写了一半的和弦表。', item: '变调夹', icon: '🎵' },
  { roomId: 206, text: '台灯下摊着一副耳机线，缠成了一团没人解开的结。', item: '耳机线', icon: '🎧' },
  { roomId: 302, text: '有人在窗口抖开刚晒好的被子，月光落了一床。', item: '晒被子', icon: '🛏' },
  { roomId: 303, text: '窗内的风铃被穿堂风吹得轻响，响声很碎。', item: '风铃', icon: '🎐' },
  { roomId: 305, text: '桌上摆着一盒没吃完的饼干，盖子斜着扣在上面。', item: '饼干盒', icon: '✦' },
  { roomId: 306, text: '有人对着镜子练习明天要讲的稿子，说到一半停了。', item: '讲稿', icon: '📖' },
  { roomId: 401, text: '四楼的窗关得最早，窗帘后透出一点屏幕的蓝光。', item: '显示器', icon: '✦' },
  { roomId: 402, text: '吉他声从窗缝里漏出来，只听见四个和弦反复。', item: '旧吉他', icon: '🎵' },
  { roomId: 403, text: '窗台上晾着一双洗干净的手套，指尖朝着外面。', item: '针织手套', icon: '🧣' },
  { roomId: 404, text: '有人把明天的课表抄在便签上，贴在窗框边上。', item: '便签纸', icon: '✏' },
  { roomId: 405, text: '一盏充电小灯亮着，旁边是叠好的两件换洗衣服。', item: '小夜灯', icon: '💡' },
  { roomId: 101, text: '门后的伞架空了一半，剩下的那把伞骨有点歪。', item: '旧伞', icon: '☂' },
  { roomId: 104, text: '走廊的感应灯被人拍亮，又慢慢暗下去。', item: '感应灯', icon: '💡' },
  { roomId: 202, text: '窗内有人在小声背单词，读到第三个就卡住了。', item: '单词本', icon: '📚' },
  { roomId: 204, text: '桌上摊着一份没填完的报名表，姓名那一栏是空的。', item: '报名表', icon: '✏' },
  { roomId: 302, text: '有人把湿头发搭在椅背上，风扇对着吹。', item: '小风扇', icon: '✦' },
  { roomId: 303, text: '窗台上晒着几片橘子皮，屋里有一点清苦的香。', item: '橘子皮', icon: '🍵' },
  { roomId: 306, text: '楼下的猫跳上空调外机，在窗台上坐了一会儿。', item: '猫爪印', icon: '🐈' },
  { roomId: 402, text: '有人靠在窗边数楼下的自行车，数到第七辆就睡了。', item: '车铃', icon: '🚲' },
  { roomId: 404, text: '桌上放着一碗已经凉了的粥，勺子立在碗边。', item: '白瓷勺', icon: '🥣' },
  { roomId: 405, text: '窗内的灯忽明忽暗了一下，然后稳定下来。', item: '旧灯管', icon: '💡' },
  { roomId: 201, text: '有人在窗边给绿植换盆，泥土撒了一小片在窗台上。', item: '陶土盆', icon: '🪴' },
  { roomId: 103, text: '走廊尽头传来拖把拖地的声音，一下一下的。', item: '拖把', icon: '✦' }
]

/**
 * @param {number} idx window index 0..23
 * @param {number} nightIndex 0..2
 * @returns {{ roomId: number, text: string, item: string, icon: string }}
 */
export function flowingStoryFor(idx, nightIndex) {
  const roomId = roomIdForIndex(idx)
  const pool = FLOWING_STORIES.filter(s => s.roomId === roomId)
  const list = pool.length ? pool : FLOWING_STORIES
  return list[Math.abs(idx * 3 + nightIndex) % list.length]
}

// ---------------------------------------------------------------------------
// Resonance pairs
// ---------------------------------------------------------------------------

/**
 * @type {Array<{ rooms: [number, number], line: string }>}
 */
export const RESONANCE_PAIRS = [
  { rooms: [102, 304], line: '一楼保温桶的热气，顺着雨声飘到了三楼的书桌前。' },
  { rooms: [205, 402], line: '四楼的吉他声顺着风飘进二楼，广播里的尾音刚好接上。' },
  { rooms: [203, 406], line: '画纸上的星空和望远镜里的星空，在同一个夜里对上了。' },
  { rooms: [301, 203], line: '关东煮的热气爬到二楼窗台，绿萝的叶子被熏得发亮。' },
  { rooms: [304, 102], line: '三楼的台灯和一楼的门灯，中间隔着一整段楼梯。' },
  { rooms: [406, 205], line: '天台的信号和电台的电波，在屋顶上方轻轻碰了一下。' },
  { rooms: [301, 304], line: '夜宵的汤勺声和翻书声，隔着一条走廊轮流响着。' },
  { rooms: [102, 203], line: '一楼的茶壶盖轻响，二楼的铅笔正好停了一下。' },
  { rooms: [402, 301], line: '吉他的第四个和弦，正好落在关东煮开锅的那一声上。' },
  { rooms: [406, 304], line: '顶楼的星图和三楼的笔记，都摊开在同一片月光里。' }
]

/**
 * @param {number} nightIndex
 * @returns {{ rooms: [number, number], line: string }}
 */
export function resonanceForNight(nightIndex) {
  return RESONANCE_PAIRS[nightIndex % RESONANCE_PAIRS.length]
}

// ---------------------------------------------------------------------------
// Endings
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   id: string,
 *   cutscene: string,
 *   headline: string,
 *   narration: string,
 *   motto: string,
 *   whisper: string,
 *   letter: { fromRoom: string, salutation: string, body: string, sign: string }
 * }} EndingScript
 */

/** @type {Record<string, EndingScript>} */
export const ENDING_SCRIPTS = {
  ENDING_C_STARGAZER: {
    id: 'ENDING_C_STARGAZER',
    cutscene: 'stargazer',
    headline: '屋顶的银河',
    narration: '镜头越过屋顶栏杆，水塔边的望远镜正对着整片星河。少年回头，朝楼下比了个手势。',
    motto: '从屋顶看下去，每一扇窗都是一颗星星。',
    whisper: '今晚 406 的望远镜里，装下了整栋楼的星光。',
    letter: {
      fromRoom: '406室 · 星野',
      salutation: '致今晚帮我吹散云层的人：',
      body: '十一点四十二分，双子座的第一颗流星真的划过水塔顶上了。谢谢你把四楼的灯连成了一条银河，让我在毕业前的最后一个冬天没有错过它。',
      sign: '406 窗边的望远镜'
    }
  },
  ENDING_D_HARMONY: {
    id: 'ENDING_D_HARMONY',
    cutscene: 'harmony',
    headline: '晚风大合唱',
    narration: '二十四扇窗化作跳动的音阶，金色的星桥在整面墙上交织成一张网。风穿过走廊，像有人在指挥。',
    motto: '每一扇窗都在唱，只是以前没有人把它们连起来。',
    whisper: '原来整栋楼一直都会唱歌，只是缺一个起拍的人。',
    letter: {
      fromRoom: '205室 · 阿澈',
      salutation: '致把整栋楼接进同一段旋律的人：',
      body: '毕业前的最后一期夜话，本来只有我一个人在说。后来四楼的吉他进来了，三楼翻书的声音进来了，一楼保温桶的盖子也响了一下。这期节目，我不打算剪掉任何一段杂音。',
      sign: '205 桌上的旧耳麦'
    }
  },
  ENDING_E_DAWN: {
    id: 'ENDING_E_DAWN',
    cutscene: 'dawn',
    headline: '破晓第一缕光',
    narration: '夜空从深蓝一路退成金粉，远山浮起晨雾。一楼宿管的大门推开，暖光一直铺到台阶下面。',
    motto: '守了一整夜的人，最先看见天亮。',
    whisper: '灯亮到最后，天就自己亮了。',
    letter: {
      fromRoom: '102室 · 林阿姨',
      salutation: '给守到天亮的那个人：',
      body: '我在这栋楼里值了十九年班，见过很多次天亮。有人是熬到天亮的，有人是被天亮叫醒的。你是头一个，把整栋楼的灯都点着，再坐着等天亮的。锅里有粥，记得吃。',
      sign: '102 值班室的保温桶'
    }
  },
  ENDING_A_WARMTH: {
    id: 'ENDING_A_WARMTH',
    cutscene: 'warmth',
    headline: '万家灯火',
    narration: '整栋楼二十四扇窗一起常亮，六盏河灯从屋顶缓缓升进满月。地上的水洼里，倒影连成一片暖海。',
    motto: '十七号楼的春天，是从一扇窗开始的。',
    whisper: '今晚的十七号楼，从楼下看像一整块暖玉。',
    letter: {
      fromRoom: '203室 · 小禾',
      salutation: '致今晚把这栋楼画亮的人：',
      body: '我画过很多次这栋楼，画到后来才发现，最难画的不是墙和窗，是灯亮起来以后空气里的那种颜色。今晚我总算调出来了。这幅画送给你，背面写了日期，你可以一直留着。',
      sign: '203 窗台上的画板'
    }
  },
  ENDING_B_COMPANION: {
    id: 'ENDING_B_COMPANION',
    cutscene: 'companion',
    headline: '留一盏夜灯',
    narration: '镜头轻轻推近三楼的窗台，橘猫在窗边摇了摇尾巴。细雨化成金色的萤火，绕着楼慢慢飞。',
    motto: '不用全部点亮，留一盏就够了。',
    whisper: '有一盏灯是专门留给你的，什么时候回来都亮着。',
    letter: {
      fromRoom: '304室 · 知夏',
      salutation: '给今晚没有催我关灯的人：',
      body: '其实我知道自己看不了那么多页，但还是想再坐一会儿。窗外那只橘猫今晚又来了，蹲在空调机上，陪我到最后。谢谢你没有把整栋楼都点亮，留了一盏，刚好够我看清这一页。',
      sign: '304 台灯下的笔记本'
    }
  },
  ENDING_F_DRIFT: {
    id: 'ENDING_F_DRIFT',
    cutscene: 'drift',
    headline: '未完的草稿',
    narration: '亮着的几扇窗柔和地闪了闪，没亮的窗户透出淡淡的月光蓝。树影安静地摇，没有任何提示跳出来。',
    motto: '没亮完的窗，都在做着不用醒来的梦。',
    whisper: '今晚就先到这儿吧，剩下的窗明天还开着。',
    letter: {
      fromRoom: '301室 · 阿满',
      salutation: '给今晚路过的人：',
      body: '锅里的汤还剩小半锅，我们没吃完就困了。窗台上给你留了一只杯子，干净的，倒扣着。你要是哪天路过，敲两下玻璃就行，不用客气。',
      sign: '301 窗台上的马克杯'
    }
  }
}

/**
 * @param {string} id
 * @returns {EndingScript}
 */
export function endingScript(id) {
  return ENDING_SCRIPTS[id] || ENDING_SCRIPTS.ENDING_F_DRIFT
}

// ---------------------------------------------------------------------------
// Offline builders — the always-available fallback for the four agents
// ---------------------------------------------------------------------------

/**
 * Third-night closing line for the bond resident, used by the epilogue when the
 * model is unavailable.
 * @param {number} roomId
 * @param {'A'|'B'} path
 * @returns {string}
 */
function closingLine(roomId, path) {
  const node = residentStory(roomId, 2, path)
  return node ? node.text : ''
}

/**
 * Build a complete three-night plan without any network call.
 *
 * The shape matches normalizePlanPayload() exactly, so the game can drop it in
 * anywhere an AI plan is expected.
 *
 * @param {string} mood
 * @param {{ unlockedEndings?: string[], playCount?: number, bonds?: Record<string, number> }} [records]
 * @returns {{ directorNote: string, nights: any[] }}
 */
export function buildOfflinePlan(mood, records = {}) {
  const token = moodToken(mood)
  const playCount = Number(records.playCount) || 0
  const unlocked = Array.isArray(records.unlockedEndings) ? records.unlockedEndings : []

  // Rotate the resident line-up by play count so a replay does not stage the
  // exact same three beacons in the exact same order.
  const rotation = playCount % RESIDENTS.length
  const nights = []
  for (let n = 0; n < 3; n++) {
    const picks = [0, 1, 2].map(k => RESIDENTS[(rotation + n * 2 + k) % RESIDENTS.length])
    const seen = new Set()
    const stories = []
    for (const res of picks) {
      if (seen.has(res.roomId)) continue
      seen.add(res.roomId)
      const node = residentStory(res.roomId, n, 'A')
      if (!node) continue
      stories.push({
        roomId: res.roomId,
        resident: res.resident,
        text: node.text,
        item: res.item,
        icon: res.icon,
        choices: node.choices.map(c => ({ ...c }))
      })
    }
    // Top up from the remaining residents if the rotation collided.
    for (const res of RESIDENTS) {
      if (stories.length >= 3) break
      if (seen.has(res.roomId)) continue
      const node = residentStory(res.roomId, n, 'A')
      if (!node) continue
      seen.add(res.roomId)
      stories.push({
        roomId: res.roomId,
        resident: res.resident,
        text: node.text,
        item: res.item,
        icon: res.icon,
        choices: node.choices.map(c => ({ ...c }))
      })
    }

    const pair = RESONANCE_PAIRS[(rotation + n) % RESONANCE_PAIRS.length]
    nights.push({
      night: n + 1,
      weather: n === 0 ? 'light_rain' : n === 1 ? 'fog' : 'clear',
      tempo: n === 0 ? token.tempo : n === 1 ? (token.tempo === 'brisk' ? 'normal' : token.tempo) : 'brisk',
      palette: n === 0 ? token.palette : token.palette,
      commissions: DEFAULT_COMMISSIONS[n].map(c => ({ ...c })),
      resonancePair: { rooms: [pair.rooms[0], pair.rooms[1]], line: pair.line },
      stories,
      postcard: n === 0
        ? '雨丝很细，刚好盖过走廊尽头的脚步声。'
        : n === 1
          ? '天是灰的，风有点闷，自习室的灯一直亮到很晚。'
          : '云散了，月亮挂在树梢，有人在小声聊天。'
    })
  }

  const note = unlocked.length
    ? '你回来过。今晚的楼记得你走过的路线。'
    : '今夜从微雨开始，慢一点也没关系。'

  return { directorNote: note, nights }
}

/**
 * Rewrite nights 2 and 3 from what actually happened on night 1.
 *
 * @param {{
 *   maxCombo?: number,
 *   dragChains?: number,
 *   resonancesCompleted?: number,
 *   choicesMade?: Array<{ roomId: number, choiceId: string, label?: string }>,
 *   litCount?: number
 * }} telemetry
 * @returns {{ nights: any[] }}
 */
export function buildOfflineEvolution(telemetry = {}) {
  const choices = Array.isArray(telemetry.choicesMade) ? telemetry.choicesMade : []
  const maxCombo = Number(telemetry.maxCombo) || 0
  const dragChains = Number(telemetry.dragChains) || 0

  /** @type {Record<number, 'A'|'B'>} */
  const byRoom = {}
  for (const c of choices) {
    const id = Number(c && c.roomId)
    if (!RESIDENT_BY_ROOM[id]) continue
    byRoom[id] = c.choiceId === 'B' ? 'B' : 'A'
  }

  const touched = Object.keys(byRoom).map(Number)
  const tempo2 = maxCombo >= 10 ? 'brisk' : dragChains >= 3 ? 'normal' : 'slow'
  const tempo3 = 'brisk'

  const nights = []
  for (let n = 1; n < 3; n++) {
    const stories = []
    // 1) Rooms the player actually responded to come back with a cause-effect
    //    follow-up on the very next night.
    for (const roomId of touched) {
      if (stories.length >= 2) break
      const res = RESIDENT_BY_ROOM[roomId]
      const node = residentStory(roomId, n, byRoom[roomId])
      if (!res || !node) continue
      stories.push({
        roomId,
        resident: res.resident,
        text: node.text,
        item: res.item,
        icon: res.icon,
        choices: node.choices.map(c => ({ ...c }))
      })
    }
    // 2) Fill the rest with residents the player has not met yet, so every run
    //    still introduces somebody new.
    for (const res of RESIDENTS) {
      if (stories.length >= 3) break
      if (stories.some(s => s.roomId === res.roomId)) continue
      const node = residentStory(res.roomId, n, byRoom[res.roomId] || 'A')
      if (!node) continue
      stories.push({
        roomId: res.roomId,
        resident: res.resident,
        text: node.text,
        item: res.item,
        icon: res.icon,
        choices: node.choices.map(c => ({ ...c }))
      })
    }

    // Prefer a resonance pair that links something the player touched.
    let pair = RESONANCE_PAIRS[(n * 2) % RESONANCE_PAIRS.length]
    if (touched.length) {
      const linked = RESONANCE_PAIRS.find(p => p.rooms.includes(touched[0]) && p.rooms.some(r => !touched.includes(r)))
      if (linked) pair = linked
    }

    nights.push({
      night: n + 1,
      weather: n === 1 ? 'fog' : 'clear',
      tempo: n === 1 ? tempo2 : tempo3,
      palette: n === 1 ? 'warm_blue' : 'clear_peach',
      commissions: DEFAULT_COMMISSIONS[n].map(c => ({ ...c })),
      resonancePair: { rooms: [pair.rooms[0], pair.rooms[1]], line: pair.line },
      stories,
      postcard: n === 1
        ? '你把一楼的热气带到了楼上，风把它吹散了一点。'
        : '最后一晚了，云比前几天薄。'
    })
  }

  return { nights }
}

/**
 * Build the closing letter without any network call.
 *
 * @param {{
 *   endingId?: string,
 *   bondRoomId?: number,
 *   archetype?: string,
 *   path?: 'A'|'B',
 *   totalWarmth?: number,
 *   litTotal?: number,
 *   maxCombo?: number,
 *   stampsEarned?: number
 * }} summary
 * @returns {{ archetype: string, letter: { fromRoom: string, salutation: string, body: string, sign: string }, whisperSuggestion: string }}
 */
export function buildOfflineEpilogue(summary = {}) {
  const meta = endingMeta(summary.endingId || 'ENDING_F_DRIFT')
  const script = endingScript(meta.id)
  const bondRoom = Number(summary.bondRoomId)
  const res = RESIDENT_BY_ROOM[bondRoom]

  let letter = { ...script.letter }
  if (res && res.roomId !== meta.letterFromRoom) {
    const close = closingLine(res.roomId, summary.path || 'A')
    letter = {
      fromRoom: res.resident,
      salutation: '给今晚在这扇窗前停下的人：',
      body: close + '窗台上还留着一点温度。你走的时候，灯我没有关。',
      sign: res.resident.split(' · ')[0] + ' 的窗台'
    }
  }

  const archetype = summary.archetype || meta.title
  return {
    archetype,
    letter,
    whisperSuggestion: script.whisper
  }
}

// ---------------------------------------------------------------------------
// Small helpers used by the UI
// ---------------------------------------------------------------------------

/**
 * Human label for a bond level 0..3.
 * @param {number} level
 * @returns {string}
 */
export function bondLabel(level) {
  const n = Math.max(0, Math.min(3, Number(level) || 0))
  return ['还没说过话', '见过一面', '记得你的灯', '把窗留给你'][n]
}

/**
 * Every ending id in display order, with its unlock metadata.
 * @returns {Array<{ id: string, name: string, badge: string, title: string, clue: string, type: string }>}
 */
export function endingGallery() {
  return ENDINGS.map(e => ({
    id: e.id,
    name: e.name,
    badge: e.badge,
    title: e.title,
    clue: e.clue,
    type: e.type
  }))
}

/**
 * The resident a run bonded with most, by accumulated bond level then by the
 * number of choices made in that room.
 *
 * @param {Record<string, number>} bonds roomId -> level
 * @param {Array<{ roomId: number }>} choices the choices made this run
 * @returns {number}
 */
export function deepestBondRoom(bonds, choices) {
  const counts = {}
  for (const c of choices || []) {
    const id = Number(c && c.roomId)
    if (RESIDENT_BY_ROOM[id]) counts[id] = (counts[id] || 0) + 1
  }
  let best = 0
  let bestScore = -1
  for (const roomId of CORE_RESIDENT_ROOMS) {
    const level = Number(bonds?.[String(roomId)] ?? bonds?.[roomId] ?? 0)
    const score = level * 10 + (counts[roomId] || 0)
    if (score > bestScore) { bestScore = score; best = roomId }
  }
  return best
}

export { ENDING_BY_ID, ENDINGS, MOOD_TOKENS, INDEX_TO_ROOM }

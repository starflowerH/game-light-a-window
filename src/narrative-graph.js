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
    role: '宿管界吃瓜局长',
    resident: '林阿姨 · 102室',
    icon: '☕',
    item: '黄铜钥匙',
    items: ['黄铜钥匙', '保温茶缸'],
    silhouette: 'duty',
    bond: '锁着周校长粉睡衣取外卖黑历史的抽屉',
    nights: [
      {
        text: '刚过十一点，全楼电表箱突然开始蹦迪！林阿姨一把按住抽屉里藏着的那张「周副校长上个月穿粉色卡通睡衣取错女生楼外卖」监控截图，压低嗓门冲你使眼色：「老周带队上楼查 3000W 违禁锅了，快替我把楼道灯稳住！」',
        choices: [
          { id: 'A', label: '替阿姨按住抽屉，假装抄电表', outcome: '周校长刚探头就被林阿姨一句“您那份烤冷面外卖袋子还搁我这儿呢”噎得原地立正，连查房本都拿反了。' },
          { id: 'B', label: '直接拉亮门廊大灯给楼上通风报信', outcome: '橙黄大灯猛地一闪，楼上瞬间响起齐刷刷藏电锅、拖鞋乱飞的动静，三秒钟全楼安静得像在考四六级！' }
        ]
      },
      {
        variants: {
          A: {
            text: '整栋楼突然限电黑三分钟！应急灯一亮，林阿姨居然从茶缸底摸出一张发黄的校史剪报递给你：「嘘！老周当年大四住 304 时，半夜偷煮泡面烧黑过整面墙，还给暗恋学姐写两万字检讨——结果寄错了宿舍号！」',
            choices: [
              { id: 'A', label: '悄悄拍下剪报当“谈判筹码”', outcome: '刚咔嚓一声，周校长阴恻恻的声音从门缝飘进来：「林姐，咱俩私下商量下，明天换表能不能先别提我大四的事？」' },
              { id: 'B', label: '递一杯滚烫红枣茶替老周留点体面', outcome: '周校长捧着茶杯差点老泪纵横，小声嘀咕：「其实我今晚就是来找当年藏在 406 空调机里的绝版球星卡……」' }
            ]
          },
          B: {
            text: '周副校长在门口抓包失败，气鼓鼓要查 102 监控回放，结果点开屏幕第一帧居然是王师傅用强力胶把一只偷吃火腿肠的肥橘猫从门缝里薅出来的画面——老周盯着猫脖子上的铭牌脸色骤变：「那不是我走丢三年的招财吗？！」',
            choices: [
              { id: 'A', label: '告诉他猫现在天天在 304 蹭贵猫条', outcome: '刚才还板着脸抓违纪的校领导瞬间破功，拎着两根火腿肠就往三楼冲，把查寝夹板直接扔值班台上了！' },
              { id: 'B', label: '替橘猫打掩护说它是本楼编外保安', outcome: '林阿姨憋着笑补刀：「人家猫现在管着整栋楼的老鼠，校长您想领走得先交三年伙食费！」' }
            ]
          }
        }
      },
      {
        variants: {
          A: {
            text: '明早六点全楼就要换装「超 300W 秒断电」的智能电表了！林阿姨端出五大锅绿豆汤摆在值班台前，周副校长竟然主动帮王师傅递起了扳手：「行了行了，今晚算本校长老花眼，全楼亮满一次再关灯睡觉！」',
            choices: [
              { id: 'A', label: '喊全楼下楼领汤顺便合影留念', outcome: '六层楼探出几十个脑袋齐喊「谢谢林阿姨周校长」，周老头嘴角压都压不住，还偷偷比了个剪刀手。' },
              { id: 'B', label: '把102门灯调成最暖档当压轴', outcome: '老电表完成最后一次站岗，林阿姨笑呵呵扣上茶缸盖：「这帮小兔崽子，没一个省心的，但少了还真不习惯。」' }
            ]
          },
          B: {
            text: '临近零点，林阿姨正式把那张粉睡衣社死截图撕掉扔进碎纸机，周副校长感动得差点敬礼——下一秒阿姨笑眯眯补充：「没事，云盘里王师傅还存了高清 4K 版呢，明年您接着对学生客气点哈！」',
            choices: [
              { id: 'A', label: '竖起大拇指敬阿姨是宿管界战神', outcome: '全楼走廊响起一片憋笑声，连原本紧张兮兮的熄灯倒计时都变成了大型欢乐茶话会。' },
              { id: 'B', label: '替阿姨关掉大灯只留一盏暖台灯', outcome: '她终于舒舒服服靠回藤椅，收音机里放着老歌，一楼值班室成了今晚全校最安稳的港湾。' }
            ]
          }
        }
      }
    ]
  },
  {
    roomId: 203,
    name: '小禾',
    role: '肝毕设崩溃画手',
    resident: '小禾 · 203室',
    icon: '🪴',
    item: '手绘速写本',
    items: ['手绘速写本', '窗台绿萝'],
    silhouette: 'easel',
    bond: '把甲方头像P成财神爷供在绿萝前的画板',
    nights: [
      {
        text: '小禾改完第 18 版毕设已经神志不清，把导师和甲方的微信头像 P 成财神爷贴在绿萝上拜了三拜——结果手机叮咚一响，前男友突然发来一句深情「我在楼下等你」，三秒后撤回并补了句：「发错群了，我是问拼车拼满没」。',
        choices: [
          { id: 'A', label: '点亮窗灯帮她把前任拉黑顺便画个大猪头', outcome: '她“噗嗤”笑出声，一口气把前任画成了被橘猫踩脸的漫画主角，发朋友圈十分钟收获 68 个赞！' },
          { id: 'B', label: '拉亮三楼暖光帮她看清草稿线', outcome: '她盯着画板上被照亮的宿舍夜景突然来了灵感：「不画甲方那破 logo 了，老娘毕设就画这栋沙雕宿舍楼！」' }
        ]
      },
      {
        variants: {
          A: {
            text: '停电三分钟那会儿小禾忘了按 Ctrl+S，差点原地表演一个托马斯回旋嚎啕大哭！结果应急灯一闪，平板居然自动云同步保住了全稿——不仅如此，她刚画的「周校长追猫漫画」还被楼上阿澈广播当场夸成了年度神作！',
            choices: [
              { id: 'A', label: '鼓动她把这栋楼全员都画成连载四格', outcome: '301 四兄弟立刻趴窗口喊「把我画帅点别画我光膀子吃火锅」，整面东墙瞬间变成大型约稿现场！' },
              { id: 'B', label: '给她点一盏护眼暖光先存十遍档', outcome: '她颤抖着连按十下保存键，顺手把绿萝浇了个透，长叹一口气：「今晚终于不用梦里改配色了！」' }
            ]
          },
          B: {
            text: '前男友不死心又托隔壁班同学送来一杯去冰无糖柠檬水，结果小禾刚推开窗准备硬气拒绝，手一滑杯子稳稳扣在了路过偷看八卦的 406 星野脑袋上——楼下瞬间爆发出猪叫般的笑声。',
            choices: [
              { id: 'A', label: '赶紧拉亮走廊灯给星野递纸巾救场', outcome: '星野顶着两片柠檬淡定抬头：「不碍事，正好帮我醒脑看流星！」两人对视三秒居然莫名聊起了天文漫画。' },
              { id: 'B', label: '替她把速写本摊窗台装作“刚在专心创作”', outcome: '尴尬一秒化解，她反手把“柠檬顶头名场面”画进速写本，笑得眼泪都飙出来了。' }
            ]
          }
        }
      },
      {
        variants: {
          A: {
            text: '换表前最后一晚，小禾把画完的《17号楼深夜整活众生相》大幅长卷直接贴满 203 玻璃！里面有偷煮螺蛳粉的四兄弟、追猫的周校长和嗑瓜子的林阿姨，路过的人全举着手机在楼下排队打卡。',
            choices: [
              { id: 'A', label: '一笔连亮整面窗墙给她的画作打舞台光', outcome: '整栋楼瞬间化身巨型夜光画展，连周副校长路过都忍俊不禁，掏手机悄悄拍了张照片当屏保！' },
              { id: 'B', label: '让她在画角把今晚一起巡楼的你也画进去', outcome: '画布右下角多了个提着小灯笼的剪影，旁边歪歪扭扭写着：「本楼首席不断电大恩人」。' }
            ]
          },
          B: {
            text: '导师终于在十一点五十分回了两个字「过稿」，小禾直接原地起跳差点把床板踩塌！她把财神爷打印纸折成纸飞机丢出窗外，打算今晚破天荒十二点前躺平睡觉。',
            choices: [
              { id: 'A', label: '替她把台灯调暗祝贺毕设解放', outcome: '绿萝叶子在柔和月光下晃了晃，她钻进被窝发了条动态：「再见熬夜，明天睡到自然醒！」' },
              { id: 'B', label: '留一缕暖窗光陪她刷完最后两条评论', outcome: '全班都在评论区刷“沾沾喜气”，她笑着熄了屏幕，终于安稳闭上了眼。' }
            ]
          }
        }
      }
    ]
  },
  {
    roomId: 205,
    name: '阿澈',
    role: '忘关麦电台主播',
    resident: '阿澈 · 205室',
    icon: '🎧',
    item: '旧耳麦',
    items: ['旧耳麦', '折纸船'],
    silhouette: 'mic',
    bond: '忘关公放引爆全楼吃瓜的88.4MHz麦',
    nights: [
      {
        text: '阿澈本想录一期深情款款的毕业夜话，结果忘关走廊公放开关！全楼喇叭里清清楚楚传出隔壁男生打电话求前任复合却不小心拨成辅导员手机、还深情喊了三声“宝贝我错了”的世纪社死现场！',
        choices: [
          { id: 'A', label: '赶紧切进钢琴曲替那位仁兄打圆场', outcome: '抒情钢琴声一盖上去，阿澈灵机一动接话：「以上是话剧社配音彩排！」全楼瞬间笑疯，差点救回一条社死命。' },
          { id: 'B', label: '先亮窗提醒阿澈：你外放开关还亮着红灯呢！', outcome: '阿澈低头看了一眼红灯原地石化，手忙脚乱扑上去拍麦时一屁股坐断了塑料凳，又给全楼贡献了一个新音效。' }
        ]
      },
      {
        variants: {
          A: {
            text: '限电三分钟里全楼伸手不见五指，唯有阿澈用干电池撑着的电台还活着！结果不知谁把一盘陈年磁带错塞进卡座——喇叭里突然飘出周副校长年轻时五音不全唱情歌、唱破音还骂自己嗓子哑的珍贵原声！',
            choices: [
              { id: 'A', label: '把音量拉满让全校一起鉴赏校领导天籁', outcome: '整栋楼瞬间爆发出山呼海啸的掌声，楼下周副校长捂着脸冲刺百米跑回值班室，创下十年来最快查房纪录！' },
              { id: 'B', label: '火速切回温柔晚安纯音乐保住校长尊严', outcome: '虽然晚了三秒钟全楼已经听清了，但周校长还是感激地朝 205 挥了挥手电筒，决定今晚暂缓没收他的大喇叭。' }
            ]
          },
          B: {
            text: '热线电话被打爆了！301 四兄弟连麦哭诉自己被微辣火鸡面辣到怀疑人生、406 星野现场直播对面楼外卖小哥骑车漂移，原本感伤的毕业电台彻底演变成了《17号楼午夜脱口秀》。',
            choices: [
              { id: 'A', label: '帮他连起跨楼星轨扩大电波信号', outcome: '连对面女生楼都打开手电筒跟着打节拍，阿澈眼眶一热：「本来怕毕业没人记得我，现在全校都忘不掉我了！」' },
              { id: 'B', label: '提醒他留点嗓子明晚还要播大结局', outcome: '他咕咚喝完半瓶润喉糖水，朝窗外比了个 OK 手势，把下一首曲子切成了轻柔的晚安旋律。' }
            ]
          }
        }
      },
      {
        variants: {
          A: {
            text: '毕业前最后一期子夜广播！全楼住户提前把所有想吐槽又没敢说的心里话写成纸条塞进 205 门缝：有向暗恋对象表白的、有祝林阿姨涨工资的、还有集体请求周校长明天换表手下留情的！',
            choices: [
              { id: 'A', label: '把所有窗灯连成音响矩阵一起大合唱', outcome: '整栋楼跟着电波一起哼起跑调但超响亮的毕业歌，楼下林阿姨和王师傅笑得合不拢嘴，这晚永远载入楼史。' },
              { id: 'B', label: '让阿澈念完最后一张写给全楼的晚安签', outcome: '电台里轻轻响起一句「不管明天电表限不限流，祝各位今夜吃饱睡香」，全楼窗户齐刷刷温柔眨了两下。' }
            ]
          },
          B: {
            text: '他终于学会在闭台前先检查三遍公放按钮。临拔掉旧耳麦前，辅导员居然破天荒发来一条微信：「昨晚那声宝贝我记账上了，不过节目挺热闹，毕业快乐！」',
            choices: [
              { id: 'A', label: '哈哈大笑替他点亮最后一盏庆功灯', outcome: '阿澈把聊天记录截图设为壁纸，心满意足地拉上窗帘准备睡个踏实觉。' },
              { id: 'B', label: '按下停录键留一份安静给今夜', outcome: '红灯熄灭，走廊恢复安静，耳机挂回桌角，四年大学夜话画上了最搞笑也最圆满的句号。' }
            ]
          }
        }
      }
    ]
  },
  {
    roomId: 301,
    name: '阿满',
    role: '深夜火锅重案组',
    resident: '阿满与室友 · 301室',
    icon: '🍢',
    item: '关东煮',
    items: ['关东煮', '白球鞋'],
    silhouette: 'hotpot',
    bond: '差点把整栋楼熏跳闸的3000W螺蛳粉小电锅',
    nights: [
      {
        text: '301 四兄弟趁换表前倒数三天偷开小电锅煮加臭螺蛳粉配鱼丸！刚掀开盖子，那股霸道酸笋味顺着天井直冲一楼——楼梯口立刻响起周副校长的皮鞋声，老四急中生智抄起六神花露水往空中狂喷！',
        choices: [
          { id: 'A', label: '快帮他们遮住窗光，顺便提醒把电扇关了', outcome: '结果花露水混着螺蛳粉形成了前所未有的生化奇香，周校长走到门口吸了一口直接皱眉退后三步：「这屋防蚊挺狠啊……」' },
          { id: 'B', label: '叫王师傅赶紧给 301 暗线分流防跳闸', outcome: '老王一边骂臭小子胆子肥一边把备用线一搭，小电锅居然稳住了！阿满感动得差点隔窗给他扔两串撒尿牛丸。' }
        ]
      },
      {
        variants: {
          A: {
            text: '昨天花露水混螺蛳粉的传说传遍全楼，今晚隔壁两间寝室干脆自带泡面和火腿肠组团来 301 蹭汤！结果七个人刚坐成一圈，整栋楼突然限电三分钟——黑暗里不知谁一筷子夹到了舍友的大脚趾！',
            choices: [
              { id: 'A', label: '迅速连亮三楼灯火拯救这群饿死鬼', outcome: '灯光唰地亮起，七个大男生抱着碗蹲成一排像偷地雷的土拨鼠，场面一度极其滑稽但香味真顶！' },
              { id: 'B', label: '假装宿管敲窗户吓他们一跳', outcome: '屋里瞬间安静零点五秒，紧接着响起齐刷刷藏碗的哐当声，发现是你以后全员趴窗口竖起大拇指！' }
            ]
          },
          B: {
            text: '王师傅查完线路没忍住也端碗鱼丸坐进了 301，一边吸溜粉一边传授经验：「当年周校长住楼上时比你们能作多了，他拿热得快煮饺子把保险丝烧成烟花！」话音刚落，门口闪过一道戴眼镜的身影……',
            choices: [
              { id: 'A', label: '光速塞给周校长一串萝卜堵住他的嘴', outcome: '周老头愣了一下咬了一口，小声哼道：「哼，火候还行……下不为例！明早六点前把锅收进柜子！」' },
              { id: 'B', label: '赶紧拉灭主灯全员原地装睡打呼噜', outcome: '四张床同时发出极不整齐的假呼噜，周校长站在门外忍笑摇摇头，顺手替他们把漏风的门掩上了。' }
            ]
          }
        }
      },
      {
        variants: {
          A: {
            text: '明天就要换新限电表了，小电锅正式迎来退役告别局！301 竟然把最后两碗热腾腾的青菜鱼丸端下楼送给林阿姨和周副校长，附纸条：「谢谢宽容我们四年没饿死在半夜！」',
            choices: [
              { id: 'A', label: '点亮整层楼给这口功勋小电锅办退役仪式', outcome: '全三楼集体举起马克杯隔窗干杯，豆浆泡面矿泉水碰在一起，成了毕业前最野也最暖的一顿夜宵。' },
              { id: 'B', label: '提醒阿满吃完赶紧洗锅别明天被收缴', outcome: '四个懒汉破天荒十分钟刷完所有碗筷，倒扣在窗台月光下亮得能当镜子照。' }
            ]
          },
          B: {
            text: '小电锅擦得锃亮装进了快递箱寄回家。熄灯前最后两分钟，阿满摸着圆滚滚的肚皮感叹：「以后限电了咱就老老实实早睡吧……明天记得早起去抢食堂热包子！」',
            choices: [
              { id: 'A', label: '替他们把窗灯温柔暗下来', outcome: '宿舍沉进香甜的梦乡里，再也没有电表箱蹦迪的声音，只剩整齐舒服的真呼噜。' },
              { id: 'B', label: '留一盏小夜灯照着窗台那排干干净净的碗', outcome: '碗底映着月亮，好像明天醒来又是元气满满的一天。' }
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
    bond: '每天来蹭贵猫条且来头不小的肥橘猫',
    nights: [
      {
        text: '知夏背政治背到眼神发直，窗外空调机上那只胖成煤气罐的流浪橘猫突然一爪拍开纱窗，理直气壮坐上了她的核心考点真题集——她刚想把猫抱下去，却摸到它脖子上藏着块刻着「周建国爱猫·招财」的铜牌！',
        choices: [
          { id: 'A', label: '给肥橘猫开一盏聚光灯细看铜牌', outcome: '周建国不就是楼下天天板着脸查寝的周副校长吗？！合着全校最有威严的领导走丢三年的主子一直在三楼白嫖猫条！' },
          { id: 'B', label: '先拿半杯温牛奶把猫祖宗请下真题本', outcome: '肥橘吧唧吧唧喝完奶，翻个肚皮直接睡在她错题本边上打呼噜，知夏紧绷了一整天的眉心一下子松开了。' }
        ]
      },
      {
        variants: {
          A: {
            text: '周副校长听到风声一路小跑冲上三楼，刚推开走廊门就和蹲在 304 窗台的肥橘四目相对！老头子眼眶瞬间红了喊出一声「招财我的宝」，结果胖橘高冷地甩了甩尾巴，回头又蹭了蹭知夏手里的猫条！',
            choices: [
              { id: 'A', label: '帮周校长递一根鸡肉猫条救场', outcome: '胖橘闻到肉香终于勉强恩准老头摸了两下下巴！周校长大喜，当场特批 304 以后晚上十一点半前不断台灯电！' },
              { id: 'B', label: '调侃校长：猫在这蹭吃半年得结清猫粮账', outcome: '周校长二话不说掏出手机网购了两大箱高级猫罐头直接寄到 304，知夏笑得真题书都差点滑下桌。' }
            ]
          },
          B: {
            text: '停电三分钟时知夏本来慌得不行，结果隔壁 301 的热汤味、205 的搞笑广播和脚边胖橘像拖拉机似的呼噜声凑一块，她反而笑出了声——原来半夜觉得孤单时，整栋楼其实吵吵闹闹陪着自己呢。',
            choices: [
              { id: 'A', label: '用暖光连亮三楼整排书桌给学姐打气', outcome: '一排书房同时亮起温暖台灯，肥橘满意地踩了踩奶，知夏提笔刷刷解开了卡了两天的压轴题。' },
              { id: 'B', label: '把她的复习计划表翻到「今晚早睡」那页', outcome: '她揉揉发酸的肩膀决定不再死磕，冲杯热牛奶看着窗外热闹的楼景歇了口气。' }
            ]
          }
        }
      },
      {
        variants: {
          A: {
            text: '换表前最后一晚，周副校长特地抱了个豪华猫窝放在一楼门廊，结果胖橘闻了闻还是熟门熟路爬楼梯回了 304！知夏合上最后一套模拟卷笑着摆摆手：「明天考完试，咱俩一起睡个昏天黑地！」',
            choices: [
              { id: 'A', label: '为一人一猫点亮三楼最暖的幸运灯', outcome: '猫爪拍在窗玻璃上留下个圆滚滚的梅花印，窗内暖光洒满走廊，今晚彻底告别焦虑失眠。' },
              { id: 'B', label: '帮她关大灯只留一缕柔和月光', outcome: '台灯啪嗒关上，胖橘蜷在被子角发出均匀小呼噜，知夏三分钟就沉沉睡着了。' }
            ]
          },
          B: {
            text: '知夏在旧窗框里塞了一张笑脸便签留给下届考研的学弟学妹：「背不下去就去逗楼下胖橘，它是校领导亲戚，摸一把沾好运！」',
            choices: [
              { id: 'A', label: '把纸条照亮方便以后大家一眼看见', outcome: '纸角在暖光下轻轻抖了抖，这份又搞笑又温暖的接力棒稳稳留在了 304。' },
              { id: 'B', label: '道一声晚安，明早精神百倍上战场', outcome: '闹钟调好，被角掖紧，今晚的 304 安静得像被星光裹住了一样。' }
            ]
          }
        }
      }
    ]
  },
  {
    roomId: 406,
    name: '星野',
    role: '望远镜吃瓜先锋',
    resident: '星野 · 406室',
    icon: '🔭',
    item: '黄铜星图',
    items: ['黄铜星图', '半块月亮'],
    silhouette: 'telescope',
    bond: '表面观星实则替全楼望风外卖小哥的望远镜',
    nights: [
      {
        text: '别人都以为顶楼 406 的星野是个高冷天文少年，其实他半夜架起高倍望远镜——镜头正死死盯着校门口围墙：「快快快！301 的烧烤外卖小哥被保安拦在东门了，换西门树丛那条路绕进来！」',
        choices: [
          { id: 'A', label: '帮他拉亮四楼灯给外卖小哥打暗号', outcome: '四楼两闪一长灯刚亮起，小哥秒懂掉头冲向西门，顺便还从树底捡出了周副校长多年前埋在那儿的绝版球星卡铁盒！' },
          { id: 'B', label: '调侃他：天文社经费就是拿来盯外卖的？', outcome: '星野理直气壮推了推眼镜：「观测校园夜间人类觅食迁徙，也属于广义天体物理学！」' }
        ]
      },
      {
        variants: {
          A: {
            text: '天台突发乌龙！星野擦拭水塔边捡到的那个 2015 生锈铁盒时，周副校长突然气喘吁吁推开天台铁门大喊「别扔那是我的乔丹卡」！一老一少在月光下面面相觑三秒，星野淡定问：「校长，这卡能换今晚不拉电闸吗？」',
            choices: [
              { id: 'A', label: '见证这笔跨世代的世纪交易达成', outcome: '周校长把失而复得的球星卡揣进胸口，大手一挥：「成交！今晚四楼以下本校长一律睁一只眼闭一只眼！」' },
              { id: 'B', label: '趁机拉周校长一起用望远镜看双子座流星', outcome: '老头凑近目镜居然真的撞见一颗巨亮绿尾流星，开心得像个小孩，连夜巡记录本都忘了签字！' }
            ]
          },
          B: {
            text: '停电三分钟那会儿全楼黑漆漆一片，星野干脆爬上天台当起了“全楼实时战况解说员”：大喊「二楼画手平板没丢稿！三楼螺蛳粉没洒！一楼老王正在修开关！大家稳住别慌！」',
            choices: [
              { id: 'A', label: '一笔画点亮整排顶楼给解说员打追光', outcome: '四楼六扇窗唰唰全亮宛如演唱会灯牌，星野激动得挥起围巾，差点把水塔黑猫晃下台阶。' },
              { id: 'B', label: '喊他赶紧下梯子小心脚滑', outcome: '他麻利滑回阳台，顺便真在云缝里拍到了一张绝美流星拖尾照片发进了全楼大群！' }
            ]
          }
        }
      },
      {
        variants: {
          A: {
            text: '换表前最后一夜，云全散开了！星野这回总算干了回正经天文社的活儿，把望远镜对准星空又缓缓摇向整栋发光的宿舍楼：「从天台往下看，你们这群半夜吃火锅写论文的家伙，亮起来还真跟银河似的！」',
            choices: [
              { id: 'A', label: '把整栋楼点成最闪亮的人间星海', outcome: '每一扇窗都亮出暖金光芒，星野按下快门定格了全楼大合照，明天直接印成全楼纪念明信片！' },
              { id: 'B', label: '拉他一起许个“明天早睡早起”的愿', outcome: '他一本正经闭眼三秒然后睁眼说：「愿望已提交宇宙服务器，现在立刻下楼睡觉！」' }
            ]
          },
          B: {
            text: '十一点五十九分，星野给望远镜套上防尘罩，水塔边那只黑猫优雅地跳进他怀里。折腾了三晚，全楼的瓜吃完了，流星也看够了，明天又是新的一天。',
            choices: [
              { id: 'A', label: '替顶楼留最后一盏温柔小台灯', outcome: '暖光静静照着黄铜星图，夜风微凉，连梦里都是流星和热腾腾的烧烤香。' },
              { id: 'B', label: '关灯道晚安，今晚谁也不许再熬夜啦', outcome: '顶楼最后一扇窗温柔暗下，整栋 17 号楼终于心满意足地睡了个好觉。' }
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
// Novella Chapters — dramatic framing & cliffhangers across the 3 nights
// ---------------------------------------------------------------------------

export const STORY_CHAPTERS = [
  {
    night: 1,
    kicker: '第一夜 · CHAPTER I',
    title: '《是谁半夜偷开 3000W 螺蛳粉小火锅？》',
    sceneCue: '熄灯铃刚响，一股霸道酸笋香混着六神花露水味从三楼直冲值班室，总电表开始蹦迪！',
    beats: [
      { speakerId: 'aunt_lin', line: '林阿姨飞快按住抽屉里「周副校长穿粉睡衣取错外卖」的社死截图：「小夜巡员救场！明天全楼就要换超 300W 秒断电的智能电表，今晚楼上那帮小兔崽子全在疯狂整活，老周已经拎着巡查板杀上来了！」' },
      { speakerId: 'uncle_wang', line: '「我刚给老线路接好防跳闸土法分流，」王师傅啃着烤肠乐呵呵说，「你只管点/划亮微光窗稳住电压——碰上红金信标就点开吃大瓜，星轨双窗拖连或先后点击都能直接接通！」' }
    ],
    cliffhanger: '……第 1 夜的螺蛳粉味刚压下去，205 广播站的红灯居然忘了关！喇叭里突然传出一阵全楼社死的求复合通话，紧接着楼下周副校长的脸刷地红到了耳根——明天夜里，全楼吃瓜修罗场正式引爆！'
  },
  {
    night: 2,
    kicker: '第二夜 · CHAPTER II',
    title: '《麦忘关了！全楼社死与校长黑历史大曝光》',
    sceneCue: '全楼突陷限电危机，广播站错播周副校长大四跑调情歌，三楼胖橘猫竟亮出“招财”御赐铜牌！',
    beats: [
      { speakerId: 'dean_zhou', line: '周副校长背着手强装镇定，耳朵却通红：「咳！刚才喇叭里那段五音不全的录音纯属恶意剪辑！……对了，听说 304 窗台那只胖橘猫脖子上挂着铜牌，你巡楼时顺便帮我确认下它最近胖没胖。」' },
      { speakerId: 'aunt_lin', line: '林阿姨憋笑拍拍你肩膀：「今晚不仅有前任发错群、七人偷吃火锅摸黑夹脚趾，还能挖出老周当年藏在天台的绝版球星卡——接住红金信标和跨窗星轨，把全楼的大瓜连成片！」' }
    ],
    cliffhanger: '……周副校长找回走丢三年的肥橘“招财”和绝版球星卡，竟然当场和林阿姨、王师傅达成停火协议！明早六点正式换装新电表——最后一夜，全楼获得史上唯一一次「校长假装老花眼」的终极放飞晚安夜！'
  },
  {
    night: 3,
    kicker: '第三夜 · FINALE CHAPTER',
    title: '《明早换智能电表前，全楼最后的放飞晚安夜》',
    sceneCue: '林阿姨端出五大锅绿豆汤，周校长假装老花眼，406 望远镜总算对准了真正的双子座流星！',
    beats: [
      { speakerId: 'aunt_lin', line: '林阿姨把五大锅冰糖绿豆汤排在门廊：「明天换了限电表，这帮孩子可就得老老实实早睡喽！今晚最后陪大家疯完这 75 秒，让每间屋子都笑完再安心关灯！」' },
      { speakerId: 'dean_zhou', line: '周副校长难得收起严肃查房夹板，抱着肥橘招财抬头望向整面窗墙：「不催拉闸……今晚让我看着 17 号楼亮满一次，大伙笑完早点钻被窝！」' }
    ],
    cliffhanger: '三夜整活夜巡圆满收官——住户们连夜写给你的搞笑又暖心小纸条，已经塞进门缝啦！'
  }
]

export function chapterMeta(nightIndex) {
  const idx = Math.max(0, Math.min(STORY_CHAPTERS.length - 1, Math.floor(Number(nightIndex) || 0)))
  return STORY_CHAPTERS[idx]
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
    ? '全楼都在传你上次帮他们瞒过周校长的光荣事迹，今晚的新瓜已经切好在窗后等你啦！'
    : '明早全楼就要换超300W秒跳闸的智能电表！今晚有人偷煮螺蛳粉、有人忘关麦，快上去稳住！'

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

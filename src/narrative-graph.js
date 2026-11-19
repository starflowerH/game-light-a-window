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
    bond: '锁在抽屉深处的2015缺页值班簿',
    nights: [
      {
        text: '熄灯钟早敲过了，102 的电表却突然咔哒倒跳一格。林阿姨飞快合上那本缺了第47页的2015值班簿，把一把发黑的黄铜钥匙压在保温桶下：「周副校长刚才上楼前，问过天台老闸门的钥匙还在不在……」',
        choices: [
          { id: 'A', label: '替她守住钥匙，记下电表读数', outcome: '门外脚步声刚走远，她才松了肩低声说：「当年那场暴雨夜，顶楼锁门的人根本不是我。」' },
          { id: 'B', label: '接亮门廊灯，假装只是例行检修', outcome: '橙光落到走廊尽头，周副校长扶着眼镜顿住半秒，竟没进门翻看值班表，只轻轻留下一句：「明天还要改线。」' }
        ]
      },
      {
        variants: {
          A: {
            text: '停电三分钟骤然袭来！应急灯亮起的一瞬，林阿姨居然摸黑凭记忆摸出了那截藏在柜底的铜备用线：「十一年前那晚，有个孩子淋着雨冲进来求我晚十分钟拉闸——如今那个孩子带着公文包回来了。」',
            choices: [
              { id: 'A', label: '追问公文包里装着什么', outcome: '她指了指楼上406的亮光：「去连亮他的窗吧，那卷没寄出去的毕业磁带，当年就被封在天台铁盒里。」' },
              { id: 'B', label: '先帮她接通应急暖茶炉', outcome: '热水刚滚开，走廊尽头突然响起敲玻璃声——周副校长独自站在雨雾里，手里捏着当年的夜巡袖标。' }
            ]
          },
          B: {
            text: '半夜两点风猛地吹开值班室门，一份十一年前的处分撤回申请从周副校长掉落的文件夹滑到脚边。林阿姨盯着落款日期愣住：原来那场火灾虚惊的责任，当年竟全被他一个人扛了。',
            choices: [
              { id: 'A', label: '把纸折好塞回门口信箱', outcome: '信纸刚落进铁箱，门廊传感灯忽地通明，两代宿夜人的影子在光里重叠了一瞬。' },
              { id: 'B', label: '喊住刚转进楼梯间的他', outcome: '周副校长背对着光停了一拍，轻声问：「阿姨，406 窗台那块补过的木栓……这十年还牢吗？」' }
            ]
          }
        }
      },
      {
        variants: {
          A: {
            text: '凌晨总闸切改前最后一小时！林阿姨把那把十年没启封的黄铜钥匙正正摆在桌心，102 的门口站着整整六层楼探头张望的目光——全楼都在等她按下那个让历史重新通电的开关。',
            choices: [
              { id: 'A', label: '让102成为整栋楼的点火起点', outcome: '「啪」地一声清响，从一楼门廊直上五楼水塔的整条铜副线全数点亮，十九年的值班台第一次比白昼还亮。' },
              { id: 'B', label: '和她把最后一杯热姜茶摆到窗台', outcome: '她看着门外排开的一排光影笑了：「行了，旧账今晚一笔勾销，明天新电表装好，我还守这一楼门灯。」' }
            ]
          },
          B: {
            text: '十一点五十八分，林阿姨翻开值班表最后一张空白纸，把周副校长当年签一半的姓名悄悄描全。窗外最后一阵风掠过，二楼到顶楼所有旧回路忽然一起传回微弱而稳定的蜂鸣。',
            choices: [
              { id: 'A', label: '替她拍下今晚全亮的光表读数', outcome: '相纸上的数字定格在零点整——原来不是故障，整栋楼二十四户都在各自桌前替她留了夜灯。' },
              { id: 'B', label: '扶她靠回藤椅听完广播尾音', outcome: '电台杂音里传出一声迟到了十一年的「林阿姨辛苦了」，她摘下老花镜，眼里映满整片窗海。' }
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
    bond: '墙灰下露出半张的2015星轨草图',
    nights: [
      {
        text: '深夜刮掉窗边起皮的旧墙纸，小禾惊得捏紧美工刀——泛黄水泥底下竟藏着一张 2015 年的炭笔速写，画的正是今晚这栋楼的窗口连线，角落批注写着：「千万别让 205 和 406 同时暗下去」。',
        choices: [
          { id: 'A', label: '用暖光照出炭笔隐藏坐标', outcome: '光线斜打上去，纸背透出铅笔印的密语：“水塔铁盒密码 1117”。画纸忽然簌簌作响，三楼传来猫叫。' },
          { id: 'B', label: '替她把旧画收进速写本夹层', outcome: '合上画本时，一枚生锈的金属拨片掉出来，上面刻的正是楼上阿澈广播台的旧呼号。' }
        ]
      },
      {
        variants: {
          A: {
            text: '全楼骤暗的三分钟里，唯有小禾刚按坐标涂上荧光粉的窗玻璃亮得吓人！画里那条从一楼爬到顶楼的折线竟然真的亮起了光路，而楼下正有人拿着手电筒急步上楼追踪线条！',
            choices: [
              { id: 'A', label: '拉亮外廊窗光替她打掩护', outcome: '整排二楼灯一起亮起混淆了视线，周副校长的手电停在楼梯转角，只捡起了她故意落在台阶的一片绿萝叶。' },
              { id: 'B', label: '把荧光坐标纸贴向304窗沿', outcome: '三楼窗缝迅速探出一只手把它接走——原来楼上的知夏也一直见过相同的笔迹。' }
            ]
          },
          B: {
            text: '小禾把十一年前的老素描和今晚的新画稿叠在台灯下透光描摹，惊愕地发现：当年画这张楼景图的毕业生，落款竟然和宿舍大厅门口那块建楼捐助铜牌上的名字一模一样。',
            choices: [
              { id: 'A', label: '连向顶楼补齐最后一笔水塔', outcome: '笔尖落下那秒，顶楼望远镜刚好对准她的窗格闪了两下，像跨越十年的隔空击掌。' },
              { id: 'B', label: '在空白处写上今晚的时间', outcome: '墨迹干透时风忽然停了，楼外草坪上传来林阿姨喊大家喝热汤的声音。' }
            ]
          }
        }
      },
      {
        variants: {
          A: {
            text: '切线倒计时前最后二十分钟，小禾把拼完整的两代楼景长卷整张贴在 203 玻璃内侧。从楼下望上来，旧素描的线条竟然与今晚每一扇真实亮着的窗分毫不差地咬合在一起！',
            choices: [
              { id: 'A', label: '按长卷路线一笔连亮整面东墙', outcome: '灯光顺着炭笔轨迹一路攀升，整面墙忽然化作一幅活过来的发光明信片，连值班室监控都定格了三秒。' },
              { id: 'B', label: '邀楼下林阿姨上来在角落落款', outcome: '老宿管拿着圆珠笔犹豫了半天，只签了三个字：「都在灯里」，却让小禾红了眼眶。' }
            ]
          },
          B: {
            text: '画板收进帆布袋前，小禾忽然听见 205 电台里念到了这栋楼十年前的涂鸦故事——她低头看自己画纸右下角那个没敢签名的人影，原来当年真的有人站在她今天的位置上熬过整个冬天。',
            choices: [
              { id: 'A', label: '把这幅画留给下届住这间的人', outcome: '她把画压在窗台玻璃下，背面留字：「如果半夜睡不着，数一数对面一共亮着几颗星」。' },
              { id: 'B', label: '折架台灯为自己留一束暖边', outcome: '暖光洒在刚冒芽的绿萝叶尖，今夜不再赶稿，只安安静静看整栋楼慢慢睡去。' }
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
    bond: '88.4MHz深夜播出的匿名磁带点歌',
    nights: [
      {
        text: '广播站明明十一点就拔了电源，阿澈的备用调频却在 23:17 意外接收到一道来自本楼内部的强电波：一段沙沙作响的旧磁带钢琴曲后，有人低声问了一句——「今晚还有人在听 17 号楼说话吗？」',
        choices: [
          { id: 'A', label: '推开窗接进电波，反向定位信号源', outcome: '信号指针剧烈摆动后猛地锁定在 406 顶楼与 102 值班室之间——原来那卷磁带正通过备用铜线播送！' },
          { id: 'B', label: '低声接入麦口回应：「我在听」', outcome: '耳机那头的呼吸明显停顿了两秒，紧接着一声轻笑透过雪花噪点传出来：「真好，替我转告林阿姨，今天别熬太晚。」' }
        ]
      },
      {
        variants: {
          A: {
            text: '断电危机突发时，只有阿澈这台用老干电池撑着的发射机没灭！磁带转到 B 面忽然传出一阵熟悉的中年男声独白，走廊外刚准备拉总闸的周副校长听见耳机外放的嗓音，手僵在半空。',
            choices: [
              { id: 'A', label: '把音量推给整条走廊一起听', outcome: '十一年前毕业夜那个少年自己录下的告白与歉意飘满走廊，周副校长背过身抹了把脸，悄悄松开了拉闸的手。' },
              { id: 'B', label: '切进轻柔钢琴伴奏只留微声', outcome: '噪音退成柔水般的旋律，几扇黑着的窗相继亮了起微光，像整栋楼在默默点头替老学长保密。' }
            ]
          },
          B: {
            text: '对方挂断前在频段里留了一组莫尔斯长短灯码。阿澈刚对照旧纸船折痕解码到一半，楼下突然传来王师傅急喊：「有人反接功放把保险丝烧红了！」',
            choices: [
              { id: 'A', label: '立刻帮他串联二楼稳压光路', outcome: '电流瞬间分流稳住，最后三个密码数字清晰显现出来——正好是 406 水塔锁头的年份。' },
              { id: 'B', label: '拔掉功放改用不插电口哨传信', outcome: '短促三声口哨越过雨夜穿过阳台，四楼立刻响起两下吉他和弦作答，暗号接通了！' }
            ]
          }
        }
      },
      {
        variants: {
          A: {
            text: '毕业前最后一期子夜电台开播，阿澈决定不再一个人对着天花板独白。整栋楼的居民全开着窗等待最后十秒倒数——只要今晚的星轨全部连上，88.4MHz 将把这栋楼的声音送到整个校园。',
            choices: [
              { id: 'A', label: '吹响晚安广播前的最后一记共鸣', outcome: '一楼茶盖、三楼翻书、顶楼风声全融进同一个频段，他笑红了眼说：「晚安，永不断线的 17 号楼！」' },
              { id: 'B', label: '把最后三分钟留给全部无声的窗', outcome: '没有音乐也没有说话声，只有电波里三十扇窗共同的轻微电流呼吸，成为整学期最难忘的一夜。' }
            ]
          },
          B: {
            text: '他把那盘转完的旧磁带和自己录了三年的纸船塞进同一个铁皮匣。临关台时，听众热线居然破天荒亮起五盏绿灯，全是隔壁几栋宿舍楼追着这阵光赶来告别的人。',
            choices: [
              { id: 'A', label: '打开跨楼回音让大家都说一句晚安', outcome: '此起彼伏的「早点睡呀」撞碎在夜空里，原先紧绷的夜巡铃声也变得像节日晚钟般轻快。' },
              { id: 'B', label: '替他轻按下红色停录键收尾', outcome: '红灯暗下去，耳机里最后一声电流咔嗒响起，他长舒一口气把窗帘拉上了一半。' }
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
    bond: '跳闸后撞破墙内的隐秘铜副线',
    nights: [
      {
        text: '301 半夜偷偷架小电锅煮关东煮，正夹起第一串萝卜，总开关却毫无预兆啪地跳了——诡异的是，整层黑透了唯有他们插座边那根墙内暗铜线还在发着滚烫的金光！',
        choices: [
          { id: 'A', label: '叫来王师傅顺着热铜线查到底', outcome: '电工大爷抠开墙角石膏愣了两秒，压低嗓门：「嘘！这是我当年替这栋楼偷接的不断电保温线，谁也别告诉周校长！」' },
          { id: 'B', label: '快手拉好窗帘先把锅藏进被窝', outcome: '刚遮住光亮，门口手电光扫过，只剩玻璃上哈出的一朵小小笑脸证明这里还有人醒着。' }
        ]
      },
      {
        variants: {
          A: {
            text: '王师傅被迫摊牌后干脆坐在 301 边喝鱼丸汤边修线：「十一年前那次停电夜，有个考研晕倒在走廊的小姑娘全靠一条临时线才打通热线……所以我偷偷把铜芯焊在了老楼墙骨里。」',
            choices: [
              { id: 'A', label: '帮老王接好防过载分压开关', outcome: '老旧铜线重新发出轻快嗡鸣，301 一锅丸子腾起白雾，顺便救活了整排三楼的备用台灯！' },
              { id: 'B', label: '端两串热萝卜悄悄送去一楼门口', outcome: '老王拍着大腿乐了：「臭小子懂事，林阿姨要是吃了这口汤，今晚周老头就算拿钳子来也剪不断线！」' }
            ]
          },
          B: {
            text: '整层停电的三分钟里，隔壁两间寝室索性都端着搪瓷碗钻进 301，围着一支小手电分完最后半锅汤。昏暗里不知谁说了句：「明天大修剪断旧线，这屋里的灯还会这么亮吗？」',
            choices: [
              { id: 'A', label: '用连光照亮整排三楼回一句不会暗', outcome: '窗灯啪啪接连亮起，几个男生同时趴在窗口朝下面嗷地一声欢呼，把雾气都冲散了一半。' },
              { id: 'B', label: '提议把今晚吃光的碗排在窗沿作记号', outcome: '四只印着校徽的白碗挨个倒扣在月光下，成了全楼最烟火气的信号灯。' }
            ]
          }
        }
      },
      {
        variants: {
          A: {
            text: '总闸改造前最后一夜，301 竟然破天荒得到周副校长「特批通电十五分钟」：条件是给加班拆旧配电柜的林阿姨和王师傅每人留一碗滚烫青菜丸子。',
            choices: [
              { id: 'A', label: '点亮整屋欢笑邀全层一起干杯', outcome: '豆浆和鱼丸汤碰在一块，原先令人忐忑的熄灯倒计时，忽然变成了一场温暖到发烫的送别小夜宵。' },
              { id: 'B', label: '把最后两碗悄悄端下楼梯放在值班窗', outcome: '碗底压着纸条「谢谢阿姨大爷陪我们熬过四年」，老配电房的门缝里半天没有传出声音，只有灯光更暖了一度。' }
            ]
          },
          B: {
            text: '小电锅终于彻底收箱打包进纸皮盒。熄灯前最后一分钟，阿满发现墙脚那个神秘的老插座竟然自动断掉了余电，像是完成了十一年守护任务般安稳歇息了。',
            choices: [
              { id: 'A', label: '在配电箱盖内侧签下今夜四人名字', outcome: '十年后拆开这只老铁盒的新同学，大概还会对着歪歪扭扭的「吃饱再睡」笑出声来。' },
              { id: 'B', label: '关大灯躺回被窝数窗外的月亮', outcome: '被窝暖和起来，雨滴敲在铁皮屋檐上哒哒作响，是整个秋天睡得最沉的一觉。' }
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
    bond: '塞在旧窗框里的2015鼓励纸条与独眼橘猫',
    nights: [
      {
        text: '复读到半夜两点崩溃掉泪时，窗外那只总来讨吃的独眼大橘猫竟从松动的窗框缝里叼出一张叠成千纸鹤的旧草稿纸——上面一行工整钢笔字日期赫然写着 2015.11.19：「哪怕慢一点也没关系，当年我也是三楼这盏最后熄灭的灯。」',
        choices: [
          { id: 'A', label: '打开窗接进橘猫，核对纸鹤字迹', outcome: '借着暖灯仔细辨认，那签名的缩写竟正是周副校长年轻时的笔名！小猫呼噜着一爪按住了她最难的一道错题。' },
          { id: 'B', label: '倒一碟温牛奶照亮书页边角', outcome: '奶香漫开时焦虑像潮水般退去半分，纸鹤静静压在玻璃台历底下，替她挡住了凌晨最冷的风。' }
        ]
      },
      {
        variants: {
          A: {
            text: '暴雨夜整栋楼突陷黑暗时，知夏握着那张 2015 旧纸鹤沿着安全通道下楼找备用光源，竟在一二楼拐角和急匆匆拎着应急灯上来的周副校长撞了个正着——看见她手里那只蓝墨水千纸鹤，校长的步子猛地刹住了！',
            choices: [
              { id: 'A', label: '亮出纸鹤问他：「当年坐在 304 的是您吗？」', outcome: '老先生愣了两秒忽然长舒一口气笑了：「那晚我也被一道题困到哭……没想到这只纸鹤藏在窗框里等了十一年，飞到了你手里。」' },
              { id: 'B', label: '把应急灯引回窗边先照亮楼道', outcome: '灯光重新亮起的一瞬，他往她书包侧袋悄悄塞了一包老姜糖，只说了句：「考完记得回来看看这面窗墙。」' }
            ]
          },
          B: {
            text: '夜半失眠重读那张神秘纸条时，304 对面的几间窗户像是默契接龙般逐一亮起又柔和下来——小禾递来新画的楼景明信片，301 的热气顺风飘上窗台，整面书堆仿佛都轻了一半。',
            choices: [
              { id: 'A', label: '用萤火光链连起整排书桌的窗', outcome: '一排书房亮成并肩行进的小列车，原来深夜咬牙前行的从来不止 304 这一间屋。' },
              { id: 'B', label: '把明信片贴在书桌正上方挡住台钟', outcome: '不再盯着秒针焦灼跳动，只翻完面前这一小节便安心合书。' }
            ]
          }
        }
      },
      {
        variants: {
          A: {
            text: '三夜最终章临近天明！知夏比平时提前整整半小时合上真题册，重新折好一只新的米黄色千纸鹤，稳稳塞回翻新前最后一夜的旧窗框木缝里，写给下一个在这里守夜的人。',
            choices: [
              { id: 'A', label: '抱着橘猫一起亮起三楼最暖的守护窗', outcome: '猫爪踩在她掌心，窗口暖光照得楼下水泥地亮成金色，像跨越十一年终于交接成功的火种。' },
              { id: 'B', label: '留一盏极浅的夜灯靠在椅子上等天亮', outcome: '东方泛出淡青微光时她真的熟睡过去，嘴角带着好几天未曾见过的舒展弧度。' }
            ]
          },
          B: {
            text: '总闸合上前，周副校长站在楼下抬头望向 304，朝窗口举了举手里那只没写完的旧文件夹——知夏打开台灯一明一暗闪了两下作为回应，多年的错位孤单在这一晚悄然接上了头。',
            choices: [
              { id: 'A', label: '让 304 和 102 的两扇窗同时常亮五秒', outcome: '跨越三层楼梯的灯光同时一亮，连空气里的秋凉都像突然暖了三分。' },
              { id: 'B', label: '轻轻按下开关，给忙碌自己道声晚安', outcome: '最后一声清脆的开关响后，房间沉进舒服的被窝暗色里，连橘猫也蜷成一团睡沉了。' }
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
    bond: '水塔旁锁着十年旧磁带的铁皮观测盒',
    nights: [
      {
        text: '星野正用望远镜追逐双子座极弱光斑，镜头扫过顶楼废弃水塔后侧时却陡然一僵——那里竟然蹲着个生了绿锈的 2015 铁皮密码盒，盒盖上闪着一颗连接零号副线的微弱红色指示灯，密码锁正对着 1117！',
        choices: [
          { id: 'A', label: '转开数字锁，看看十一年前封存了什么', outcome: '盖子弹开那刻，里面竟躺着一把林阿姨遗失的旧宿管铜钥副柄、一盘写着「全校早安」的磁带，以及周副校长青涩的签名！' },
          { id: 'B', label: '先护住红灯不被楼下巡查发现', outcome: '一层暖金光罩落到水塔上替它遮住强风，黑猫跳上盒盖蹲成门神，远方的流星群已开始酝酿。' }
        ]
      },
      {
        variants: {
          A: {
            text: '天台真相即将揭晓！周副校长一路追查红灯终于推开生锈的水塔铁门，看清盒子里封存了十一年的那盘老磁带后，向来严厉的校领导竟在夜风里失声红了眼圈：「原来林阿姨……一直把当年大家送我的告别留在了最高的地方。」',
            choices: [
              { id: 'A', label: '把铁皮盒里的老星图借星光摊开给所有人看', outcome: '风吹不散那张画满全楼二十四扇窗位置的星图——周校亲自转动镜头对准天空，宣布「明天改线保留顶楼这盏守望灯」。' },
              { id: 'B', label: '陪他俩在水塔下放飞一盏守夜孔明灯', outcome: '暖黄纸灯晃晃悠悠升起在双子座正下方，楼下整整四层宿舍同时传来齐声欢呼！' }
            ]
          },
          B: {
            text: '高空云压得很低，星野冒险沿着雨水打滑的维修梯把红灯信号线接上望远镜反光罩。整栋楼骤停的那瞬，他一个人在楼顶对着乌云拼命打出三长两短莫尔斯求援信号！',
            choices: [
              { id: 'A', label: '一笔画拉通四楼全部灯火回应天台', outcome: '整条顶楼犹如跑道信号灯一般骤亮，云缝仿佛也被这道强光震裂，银白星河倏然倾泻下来！' },
              { id: 'B', label: '让王师傅把底楼备份电池全推向顶层', outcome: '天台水塔的强光终于稳稳挺过三分钟暗涌，成了暴风雨夜全校园最稳的一座灯塔。' }
            ]
          }
        }
      },
      {
        variants: {
          A: {
            text: '00:55，距离老电路永远退役只剩最后五分钟。星野将望远镜平平架回水塔护栏朝下俯瞰——这一次他看的不是天上，而是脚下即将一起同步点亮的整栋校园宿舍楼。',
            choices: [
              { id: 'A', label: '点亮全楼！让地上二十四扇窗汇成星河', outcome: '从 102 到 406，每一户都成为彼此星空里最亮的那颗星。他压低帽子笑喊：「今年双子座流行雨，落地在十七号楼！」' },
              { id: 'B', label: '替他在老星图空白处添上一颗新星坐标', outcome: '笔尖落下时天边刚好划过一道极长极亮的绿尾流星，把整个夜巡故事画上了完美逗号。' }
            ]
          },
          B: {
            text: '十一点五十九分，他把重新上好油、写着新届社员名字的黄铜星图换回水塔铁盒里。黑猫摇着尾巴跃下水泥台，一切秘密回归安静的星空与明天。',
            choices: [
              { id: 'A', label: '把水塔外灯再留亮到黎明第一班车', outcome: '清晨五点的雾气升起时，水塔顶端那一点琥珀光芒还在温柔眨眼，送走了熬过漫长黑夜的每一个人。' },
              { id: 'B', label: '轻轻合上铁盒锁扣，留一段好梦给自己', outcome: '「啪嗒」轻响落定，少年摘下围巾搭在望远镜上，吹着小调走回暖烘烘的被窝。' }
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
    title: '《23:17，谁接通了零号副线？》',
    sceneCue: '细雨打湿值班室窗玻璃，2015 年的老电表指针突然倒转了一格。',
    beats: [
      { speakerId: 'aunt_lin', line: '林阿姨急急合上一本缺了第47页的值班簿，把发烫的黄铜钥匙塞进你手里：「全校三天后就要切改老总闸……可刚过十一点十七，那条早在十一年前报废的零号副线又自己通电了！」' },
      { speakerId: 'uncle_wang', line: '「周副校长刚才拎着公文包上楼查封电表了，」王师傅举起测电笔压低声道，「有几扇窗后藏着当年停电夜没说完的线索——你先亮起足够多的灯稳住电压，见到红金色信标窗就立刻点开问个明白！」' }
    ],
    cliffhanger: '……第 1 夜刚刚稳住，顶楼废弃水塔旁却突然亮起一颗没人见过十年的红色信号灯。林阿姨握紧名单脸色一变：「他真的上去了。明天夜里整栋楼要停电三分钟——如果副线守不住，那卷铁皮磁带就永远沉在天台了！」'
  },
  {
    night: 2,
    kicker: '第二夜 · CHAPTER II',
    title: '《停电三分钟与铁皮里的 2015 磁带》',
    sceneCue: '暴雨逼近校园，楼道应急灯骤闪三下，88.4MHz 调频忽然传出沙沙旧钢琴声。',
    beats: [
      { speakerId: 'dean_zhou', line: '走廊尽头传来稳却微颤的脚步声。周副校长把文件夹紧按在胸口——露出半截落款「2015.11.19」的牛皮纸边角：「别拿那把手电照墙角，今天十二点前我必须核实 406 天台上面的东西还在不在。」' },
      { speakerId: 'aunt_lin', line: '「小夜巡员，今晚会连着两道跨窗星轨，电压也更急！」林阿姨拉紧雨衣，「接住信标里的线索与星轨桥梁，弄清十一年前那个暴雨夜，周校长和老楼之间到底藏着什么秘密！」' }
    ],
    cliffhanger: '……总闸改造倒计时最后一小时逼近！十一年前被周副校长独自扛下的处分申请、被王师傅藏进墙骨的铜芯线、以及 406 铁盒里写着「全校早安」的老磁带全都浮出了水面——最后一夜，所有人的光将在零点汇成同一道答案！'
  },
  {
    night: 3,
    kicker: '第三夜 · FINALE CHAPTER',
    title: '《总闸落锁前，整栋楼的回音》',
    sceneCue: '乌云散开一线，双子座流星正掠过水塔上方，每扇未睡的窗都在等最后一轮共鸣。',
    beats: [
      { speakerId: 'aunt_lin', line: '林阿姨把擦得锃亮的黄铜钥匙正式摆在桌心：「十九年了，这栋老宿舍楼今晚过后就要彻底换新线路。你点亮的每一排窗，都是在替过去十一年留住最后一回记忆。」' },
      { speakerId: 'dean_zhou', line: '周副校长难得摘下了严厉的查房夹板，抬头望向亮着灯的窗口长舒了一口气：「不急着拉闸……今晚让我看着这整栋楼亮满一次，再送大家好好睡个觉吧。」' }
    ],
    cliffhanger: '三夜守望终章落幕——属于这栋宿舍楼的黎明回信，已经为你拆封。'
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
    ? '23:17 零号副线比昨晚亮得更早。这栋楼还记得你上回走过的光路，这一次或许能揭开更深的秘密。'
    : '23:17，本应封存十一年前的零号副线忽然自己通电了。在总闸彻改前，沿着亮起的窗找到答案。'

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

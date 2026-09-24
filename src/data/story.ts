import type { Companion, DuskActivity } from '../state/journeyState'

export type Chapter = {
  id: string
  chapter: string
  title: string
  eyebrow: string
  line: string
  prompt: string
  image: string
  tint: string
}

export type Shot = {
  index: number
  title: string
  subtitle: string
  image: string
  mobileImage: string
  duration: number
  movement: string
  sound: string
}

const base = import.meta.env.BASE_URL
export const asset = (name: string) => `${base}assets/${name}`

export const chapters: Chapter[] = [
  { id: 'flower', chapter: '一 / 遇花', title: '先别走，花还没看完', eyebrow: '花田 · 午后四时', line: '风从花梢里穿过去，大家便都慢下来。', prompt: '在花田里找到三朵愿意同行的花', image: asset('generated/flower-field-v5.webp'), tint: '#c77a35' },
  { id: 'wreath', chapter: '二 / 编环', title: '把今天编在一起', eyebrow: '花田 · 风变轻了', line: '青禾说，花环不用对称，像我们这样就很好。', prompt: '点选花材，把花环慢慢编好', image: asset('generated/wreath-garden-v5.webp'), tint: '#d99a8d' },
  { id: 'plum', chapter: '三 / 分梅', title: '这一颗，给谁？', eyebrow: '林下 · 日影西斜', line: '一颗青梅在掌心滚了滚，甜味还没有决定去处。', prompt: '把青梅递给一位朋友', image: asset('generated/plum-forest-v5.webp'), tint: '#f2b55b' },
  { id: 'dusk', chapter: '四 / 等夕阳', title: '再坐一会儿', eyebrow: '湖畔 · 天快黑了', line: '回去也没有什么要紧的事。你想和谁并肩？', prompt: '约上想同行的人，一起看完落日', image: asset('generated/dusk-lake-v5.webp'), tint: '#7e9bae' },
]

export const companions: { id: Companion; name: string; note: string; color: string; image: string; portrait: string }[] = [
  { id: 'tang', name: '阿棠', note: '把寻常小事讲得有趣', color: '#d99a8d', image: asset('generated/flower-field-v5.webp'), portrait: asset('generated/portrait-tang-v6.webp') },
  { id: 'he', name: '青禾', note: '手很巧，会把花编得刚刚好', color: '#849f89', image: asset('generated/wreath-garden-v5.webp'), portrait: asset('generated/portrait-he-v6.webp') },
  { id: 'xi', name: '闻溪', note: '总是先听见风和鸟鸣', color: '#96aebe', image: asset('generated/plum-forest-v5.webp'), portrait: asset('generated/portrait-xi-v6.webp') },
]

export const flowers = [
  { name: '杏花', color: '#ff93ac', symbol: '✿', note: '胭脂 · 五瓣' },
  { name: '栀子', color: '#fff6d9', symbol: '✽', note: '月白 · 重瓣' },
  { name: '桔梗', color: '#80c9f5', symbol: '❀', note: '天青 · 星瓣' },
  { name: '金盏', color: '#ffc04a', symbol: '✾', note: '暖金 · 细瓣' },
  { name: '紫藤', color: '#ca9bf2', symbol: '✽', note: '藤紫 · 花穗' },
]

export const choiceLines = [
  '花枝在指间轻轻一颤，春天便有了可以带走的形状。',
  '把颜色一圈圈编进去，风也在花叶间慢了下来。',
  '青梅落进掌心，酸意和笑声都分给了身边的人。',
  '闻溪坐到身边。风把湖水吹出细纹。大家安静下来，听见同一阵晚风。',
]

export const duskActivities: { id: DuskActivity; title: string; note: string; symbol: string }[] = [
  { id: 'wind', title: '听一会儿风', note: '不说话也很好', symbol: '≈' },
  { id: 'wreath', title: '交换花环', note: '把下午戴到天黑', symbol: '✿' },
  { id: 'story', title: '讲一件小事', note: '只讲给同行的人听', symbol: '∿' },
]

export const plumReplies: Record<Companion, string> = {
  tang: '阿棠眯着眼笑：这颗酸得正好，醒一醒春困。',
  he: '青禾接过青梅，把花环往你这边轻轻推了推。',
  xi: '闻溪先分了一半给你：好东西，要一起尝。',
}

export function shotsFor(chosen: Companion, group: Companion[] = [], activity: DuskActivity = 'wind'): Shot[] {
  const friend = companions.find((item) => item.id === chosen) ?? companions[1]
  const names = [chosen, ...group.filter((id) => id !== chosen)].map((id) => companions.find((item) => item.id === id)?.name).filter(Boolean) as string[]
  const groupLabel = names.length > 1 ? `${names.slice(0, -1).join('、')}和${names[names.length - 1]}` : friend.name
  const activityLine = duskActivities.find((item) => item.id === activity)?.title ?? '听一会儿风'
  return [
    { index: 1, title: '花枝擦过镜头', subtitle: '她们在花田里等你，没人急着往前走。', image: asset('generated/storyboard-01-flower-field-v6.webp'), mobileImage: asset('generated/storyboard-01-flower-field-v6-mobile.webp'), duration: 5, movement: '前景花叶轻晃，镜头慢慢推近', sound: '风穿过草叶' },
    { index: 2, title: '手里的花环', subtitle: '青禾说：不用编得太整齐。', image: asset('generated/storyboard-02-wreath-action-v6.webp'), mobileImage: asset('generated/storyboard-02-wreath-action-v6-mobile.webp'), duration: 5, movement: '镜头从递花的手移到歪歪的花环', sound: '衣料与花梗的细响' },
    { index: 3, title: '一颗青梅', subtitle: '酸意先到，笑声随后才来。', image: asset('generated/storyboard-03-plum-action-v6.webp'), mobileImage: asset('generated/storyboard-03-plum-action-v6-mobile.webp'), duration: 4, movement: '从果篮摇到伸来的手', sound: '树上鸟鸣' },
    { index: 4, title: '有人回头', subtitle: `${friend.name}在喊你，夕阳已经落到肩上。`, image: asset('generated/storyboard-04-turn-back-v6.webp'), mobileImage: asset('generated/storyboard-04-turn-back-v6-mobile.webp'), duration: 5, movement: '逆光中定格一个回头', sound: '远处溪水' },
    { index: 5, title: '坐到天快黑', subtitle: `你和${groupLabel}一起${activityLine}，谁也没有催谁。`, image: asset('generated/storyboard-05-lakeside-linger-v6.webp'), mobileImage: asset('generated/storyboard-05-lakeside-linger-v6-mobile.webp'), duration: 6, movement: '从指尖的水纹拉到湖面与三个人', sound: '湖面水声与晚风' },
    { index: 6, title: '晚些回去', subtitle: '把今天收好，明天还可以再打开。', image: asset('generated/storyboard-06-walk-home-v6.webp'), mobileImage: asset('generated/storyboard-06-walk-home-v6-mobile.webp'), duration: 5, movement: '跟着灯笼走远，最后停在湖边小路', sound: '风声渐远，灯笼纸穗轻响' },
  ]
}

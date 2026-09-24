import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { createRoot } from 'react-dom/client'
import JSZip from 'jszip'
import { BackgroundMusic } from './music'
import { MusicControl } from './MusicControl'
import { playPickingSound, playWeavingSound } from './interaction-sounds'
import './styles.css'
import { DisplayImage } from './DisplayImage'
import {
  clearJourneySnapshot,
  parseWovenParam,
  readJourneySnapshot,
  serializeWoven,
  validActivity,
  validCompanion,
  writeJourneySnapshot,
  type Companion,
  type DuskActivity,
} from './state/journeyState'
import { chapters, choiceLines, companions, duskActivities, flowers, plumReplies, shotsFor, asset, type Shot } from './data/story'

type ExportProgress = {
  completed: number
  total: number
  stage: 'images' | 'packaging' | 'complete'
}

const DEFAULT_EXPORT_PROGRESS: ExportProgress = { completed: 0, total: 12, stage: 'images' }

function App() {
  const [chapterIndex, setChapterIndex] = useState(0)
  const [furthestChapter, setFurthestChapter] = useState(0)
  const [petals, setPetals] = useState<number[]>([])
  const [woven, setWoven] = useState<number[]>([])
  const [wovenFlowers, setWovenFlowers] = useState<Record<number, number>>({})
  const [plumChoice, setPlumChoice] = useState<Companion | null>(null)
  const [companion, setCompanion] = useState<Companion | null>(null)
  const [duskFriends, setDuskFriends] = useState<Companion[]>([])
  const [duskActivity, setDuskActivity] = useState<DuskActivity | null>(null)
  const [isFinished, setIsFinished] = useState(false)
  const [isMusicOn, setIsMusicOn] = useState(false)
  const [musicError, setMusicError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [exportUrl, setExportUrl] = useState<string | null>(null)
  const [exportProgress, setExportProgress] = useState<ExportProgress>(DEFAULT_EXPORT_PROGRESS)
  const [journeyReady, setJourneyReady] = useState(false)
  const musicRef = useRef<BackgroundMusic | null>(null)
  const exportGenerationRef = useRef(0)
  const exportAbortRef = useRef<AbortController | null>(null)
  const exportUrlRef = useRef<string | null>(null)
  const skipPersistRef = useRef(false)

  const current = chapters[chapterIndex]
  const progress = isFinished ? 100 : Math.round(((Math.min(petals.length / 3, 1) + woven.length / 4 + (plumChoice ? 1 : 0) + (duskFriends.length && duskActivity ? 1 : 0)) / chapters.length) * 100)
  const selectedFriend = duskFriends[0] ?? companion ?? plumChoice ?? 'he'
  const selectedFriends = duskFriends.length > 0 ? duskFriends : [selectedFriend]
  const shots = useMemo(() => shotsFor(selectedFriend, selectedFriends, duskActivity ?? 'wind'), [selectedFriend, duskFriends, duskActivity])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const linkedFriends = [...new Set((params.get('friends') ?? params.get('friend') ?? '').split(',').filter(validCompanion))]
    const linkedActivity = params.get('activity')
    const hasShare = linkedFriends.length > 0
    if (hasShare) {
      const linkedFlowers = [...new Set((params.get('flowers') ?? '').split(',').filter(Boolean).map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < flowers.length))].slice(0, 3)
      const linkedWoven = parseWovenParam(params.get('woven'), flowers.length)
      const linkedPlum = params.get('plum')
      setDuskFriends(linkedFriends)
      setCompanion(linkedFriends[0])
      setPetals(linkedFlowers)
      setWoven(linkedWoven.woven)
      setWovenFlowers(linkedWoven.wovenFlowers)
      if (validCompanion(linkedPlum)) setPlumChoice(linkedPlum)
      if (validActivity(linkedActivity)) setDuskActivity(linkedActivity)
      setIsFinished(true)
      clearJourneySnapshot()
    } else {
      const saved = readJourneySnapshot(flowers.length, chapters.length)
      if (saved) {
        setChapterIndex(saved.chapterIndex)
        setFurthestChapter(saved.furthestChapter)
        setPetals(saved.petals)
        setWoven(saved.woven)
        setWovenFlowers(saved.wovenFlowers)
        setPlumChoice(saved.plumChoice)
        setCompanion(saved.companion)
        setDuskFriends(saved.duskFriends)
        setDuskActivity(saved.duskActivity)
      }
    }
    setJourneyReady(true)
  }, [])

  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false
      return
    }
    if (!journeyReady || isFinished) return
    writeJourneySnapshot({ version: 1, chapterIndex, furthestChapter, petals, woven, wovenFlowers, plumChoice, companion, duskFriends, duskActivity })
  }, [journeyReady, chapterIndex, furthestChapter, petals, woven, wovenFlowers, plumChoice, companion, duskFriends, duskActivity, isFinished])

  useEffect(() => {
    document.getElementById('journey-title')?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [chapterIndex, isFinished])

  useEffect(() => () => {
    musicRef.current?.dispose()
    exportGenerationRef.current += 1
    exportAbortRef.current?.abort()
    if (exportUrlRef.current) {
      URL.revokeObjectURL(exportUrlRef.current)
      exportUrlRef.current = null
    }
  }, [])

  const toggleMusic = async () => {
    if (!musicRef.current) musicRef.current = new BackgroundMusic(setIsMusicOn, setMusicError)
    await musicRef.current.toggle()
  }

  const replaceShareUrl = (friends: Companion[], activity: DuskActivity | null) => {
    const params = new URLSearchParams({
      friends: friends.join(','),
      activity: activity ?? 'wind',
      flowers: petals.join(','),
      woven: serializeWoven(wovenFlowers, flowers.length),
      ...(plumChoice ? { plum: plumChoice } : {}),
    })
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`)
  }

  const nextChapter = () => {
    if (chapterIndex < chapters.length - 1) {
      setFurthestChapter((value) => Math.max(value, chapterIndex + 1))
      setChapterIndex((value) => value + 1)
      return
    }
    setIsFinished(true)
    const friends = duskFriends.length > 0 ? duskFriends : [companion ?? plumChoice ?? 'he']
    clearJourneySnapshot()
    replaceShareUrl(friends, duskActivity)
  }

  const reset = () => {
    exportGenerationRef.current += 1
    exportAbortRef.current?.abort()
    exportAbortRef.current = null
    skipPersistRef.current = true
    setChapterIndex(0)
    setFurthestChapter(0)
    setPetals([])
    setWoven([])
    setWovenFlowers({})
    setPlumChoice(null)
    setCompanion(null)
    setDuskFriends([])
    setDuskActivity(null)
    setIsFinished(false)
    if (exportUrlRef.current) {
      URL.revokeObjectURL(exportUrlRef.current)
      exportUrlRef.current = null
    }
    setExportUrl(null)
    setExporting(false)
    setExportError('')
    setExportProgress(DEFAULT_EXPORT_PROGRESS)
    clearJourneySnapshot()
    window.setTimeout(() => { skipPersistRef.current = false }, 0)
    window.history.replaceState({}, '', window.location.pathname)
  }

  const choosePlum = (id: Companion) => {
    setPlumChoice(id)
  }

  const choosePetal = (index: number) => {
    const removing = petals.includes(index)
    if (!removing) playPickingSound()
    setPetals((items) => items.includes(index) ? items.filter((item) => item !== index) : items.length < 3 ? [...items, index] : items)
    setWoven([])
    setWovenFlowers({})
    setFurthestChapter(0)
  }

  const chooseDuskFriend = (id: Companion) => setDuskFriends((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const chooseDuskActivity = (id: DuskActivity) => setDuskActivity(id)
  const chooseWoven = (slot: number) => {
    const previous = wovenFlowers[slot]
    const choices = petals.filter((index) => index !== previous)
    const flowerIndex = (choices.length ? choices : petals)[slot % Math.max(choices.length || petals.length, 1)] ?? 0
    setWoven((current) => current.includes(slot) ? current : [...current, slot])
    setWovenFlowers((items) => ({ ...items, [slot]: flowerIndex }))
    playWeavingSound()
  }
  const finishDusk = () => {
    const friends: Companion[] = duskFriends.length > 0 ? duskFriends : ['he']
    setDuskFriends(friends)
    setCompanion(friends[0])
    setIsFinished(true)
    clearJourneySnapshot()
    replaceShareUrl(friends, duskActivity)
  }

  const cancelExport = () => {
    exportGenerationRef.current += 1
    exportAbortRef.current?.abort()
    exportAbortRef.current = null
    setExporting(false)
    setExportProgress(DEFAULT_EXPORT_PROGRESS)
  }

  const exportStoryboard = async () => {
    const generation = ++exportGenerationRef.current
    exportAbortRef.current?.abort()
    const controller = new AbortController()
    exportAbortRef.current = controller
    const total = shots.length * 2
    let completed = 0
    setExporting(true)
    setExportError('')
    setExportProgress({ completed, total, stage: 'images' })
    if (exportUrlRef.current) {
      URL.revokeObjectURL(exportUrlRef.current)
      exportUrlRef.current = null
    }
    setExportUrl(null)
    try {
      const zip = new JSZip()
      const imageFolder = zip.folder('images')
      const markImageComplete = () => {
        completed += 1
        if (generation === exportGenerationRef.current && !controller.signal.aborted) setExportProgress({ completed, total, stage: 'images' })
      }
      for (const shot of shots) {
        throwIfAborted(controller.signal)
        const image = await loadImage(shot.image, controller.signal)
        throwIfAborted(controller.signal)
        const horizontal = await renderCrop(image, 1920, 1080, false)
        throwIfAborted(controller.signal)
        imageFolder?.file(`horizontal-${String(shot.index).padStart(2, '0')}.jpg`, await blobToArrayBuffer(horizontal))
        markImageComplete()

        const portrait = await loadImage(shot.mobileImage, controller.signal)
        throwIfAborted(controller.signal)
        const vertical = await renderCrop(portrait, 1080, 1920, true)
        throwIfAborted(controller.signal)
        imageFolder?.file(`vertical-${String(shot.index).padStart(2, '0')}.jpg`, await blobToArrayBuffer(vertical))
        markImageComplete()
      }
      throwIfAborted(controller.signal)
      const metadata = shots.map((shot) => ({ ...shot,
        sourceImage: shot.image,
        image: `images/horizontal-${String(shot.index).padStart(2, '0')}.jpg`,
        horizontalFile: `images/horizontal-${String(shot.index).padStart(2, '0')}.jpg`,
        verticalFile: `images/vertical-${String(shot.index).padStart(2, '0')}.jpg`,
        companions: selectedFriends.map((id) => companions.find((item) => item.id === id)?.name).filter(Boolean),
        activity: duskActivity ?? 'wind',
      }))
      const wreathSlots = [0, 1, 2, 3].map((slot) => ({ slot, flowerId: wovenFlowers[slot] ?? null, flower: wovenFlowers[slot] === undefined ? null : flowers[wovenFlowers[slot]]?.name ?? null }))
      zip.file('storyboard.json', JSON.stringify({ version: 2, export: { version: 1, status: 'complete', imageCount: total }, title: '晚些回去', companions: selectedFriends, activity: duskActivity ?? 'wind', flowerIds: petals, flowers: petals.map((index) => flowers[index].name), plumRecipient: plumChoice, woven, wovenFlowers, wreathSlots, shots: metadata }, null, 2))
      zip.file('storyboard.csv', `\ufeff序号,镜头,字幕,时长(秒),运镜,声音,横版文件,竖版文件\n${metadata.map((shot) => [shot.index, shot.title, shot.subtitle, shot.duration, shot.movement, shot.sound, shot.horizontalFile, shot.verticalFile].map(csvCell).join(',')).join('\n')}`)
      zip.file('subtitles.srt', shots.map((shot, index) => `${String(index + 1).padStart(2, '0')}\n${timecode(shots.slice(0, index).reduce((sum, item) => sum + item.duration, 0))} --> ${timecode(shots.slice(0, index + 1).reduce((sum, item) => sum + item.duration, 0))}\n${shot.subtitle}\n`).join('\n'))
      zip.file('README.txt', '《晚些回去》短视频分镜包\n导出版本 1 · 状态 complete\n横屏 1920×1080 与竖屏 1080×1920 各六张 JPG。竖版来自单独生成的竖构图；画面为静态分镜，运镜和声音为后期制作建议。图片路径均相对本 ZIP 根目录。字幕、镜头运动和声音提示见 storyboard.csv / storyboard.json。\n素材由互动游记根据同行选择整理。')
      if (generation === exportGenerationRef.current && !controller.signal.aborted) setExportProgress({ completed: total, total, stage: 'packaging' })
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
      throwIfAborted(controller.signal)
      const objectUrl = URL.createObjectURL(blob)
      if (generation === exportGenerationRef.current && !controller.signal.aborted) {
        exportUrlRef.current = objectUrl
        setExportUrl(objectUrl)
        setExportProgress({ completed: total, total, stage: 'complete' })
      } else {
        URL.revokeObjectURL(objectUrl)
      }
    } catch (error) {
      if (generation === exportGenerationRef.current) {
        if (!isAbortError(error)) setExportError('有一个片刻还没装进信封，请稍后再试一次。')
        setExportProgress(DEFAULT_EXPORT_PROGRESS)
      }
    } finally {
      if (exportAbortRef.current === controller) exportAbortRef.current = null
      if (generation === exportGenerationRef.current) setExporting(false)
    }
  }

  if (isFinished) {
    return <FinishScreen companions={selectedFriends} activity={duskActivity ?? 'wind'} petals={petals} wovenFlowers={wovenFlowers} plumChoice={plumChoice} shots={shots} exporting={exporting} exportProgress={exportProgress} exportUrl={exportUrl} exportError={exportError} isMusicOn={isMusicOn} musicError={musicError} onToggleMusic={toggleMusic} onExport={exportStoryboard} onCancelExport={cancelExport} onReset={reset} />
  }

  return (
    <main className="app-shell" style={{ '--chapter-tint': current.tint } as CSSProperties}>
      <div className="grain" aria-hidden="true" />
      <section className={`scene scene-${current.id}`}  aria-labelledby="journey-title">
        <DisplayImage key={current.image} className="scene-photo" src={current.image} mobileSrc={current.image.replace('-v5.webp', '-mobile-v5.webp')} eager alt="" /><div className="scene-shade" />
        <header className="topbar">
          <button className="wordmark" onClick={reset} aria-label="回到开头"><span>花朝</span><strong>晚些回去</strong></button>
          <div className="top-actions">

            <MusicControl enabled={isMusicOn} error={musicError} onToggle={toggleMusic} />
            <button className="quiet-button" onClick={reset}>重新游历</button>
          </div>
        </header>

        <aside className="chapter-rail" aria-label="游记章节">
          <div className="rail-label">游记进度</div>
          {chapters.map((item, index) => <button key={item.id} className={`chapter-marker ${index === chapterIndex ? 'active' : ''} ${index < furthestChapter ? 'done' : ''}`} disabled={index > furthestChapter} aria-current={index === chapterIndex ? 'step' : undefined} aria-label={item.chapter} onClick={() => setChapterIndex(index)}><span>0{index + 1}</span><i>{item.chapter.split(' / ')[1]}</i></button>)}
          <div className="rail-line" role="progressbar" aria-label="游记完成度" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ height: `${progress}%` }} /></div>
        </aside>

        <div className="scene-copy">
          <div className="chapter-kicker"><span className="sun-mark" />{current.eyebrow}</div>
          <div className="chapter-count">{current.chapter}</div>
          <h1 id="journey-title" tabIndex={-1}>{current.title}</h1>
          <p className="scene-line">{current.line}</p>
          <Interaction chapter={chapterIndex} petals={petals} woven={woven} wovenFlowers={wovenFlowers} plumChoice={plumChoice} duskFriends={duskFriends} duskActivity={duskActivity} onPetal={choosePetal} onWoven={chooseWoven} onPlum={choosePlum} onDuskFriend={chooseDuskFriend} onDuskActivity={chooseDuskActivity} onAllFriends={() => setDuskFriends(duskFriends.length === companions.length ? [] : companions.map((friend) => friend.id))} onFinishDusk={finishDusk} onAdvance={nextChapter} />
        </div>

        <div className="scene-footer"><span>一段关于花、朋友和落日的古风互动游记</span><span>{String(chapterIndex + 1).padStart(2, '0')} / 04</span></div>
      </section>
    </main>
  )
}

function FlowerMark({ index }: { index: number }) {
  const flower = flowers[index]
  return <svg className={`flower-mark flower-mark-${index}`} viewBox="0 0 64 64" aria-hidden="true" style={{ color: flower.color }}>
    {index === 0 && <>{[0, 72, 144, 216, 288].map((angle) => <ellipse key={angle} cx="32" cy="20" rx="10" ry="14" fill="currentColor" transform={`rotate(${angle} 32 32)`} />)}<circle cx="32" cy="32" r="6" fill="#8f3d50" /><circle cx="32" cy="32" r="3" fill="#ffdfa2" /></>}
    {index === 1 && <>{[0, 60, 120, 180, 240, 300].map((angle) => <ellipse key={angle} cx="32" cy="20" rx="8" ry="15" fill="currentColor" transform={`rotate(${angle} 32 32)`} />)}{[30, 90, 150, 210, 270, 330].map((angle) => <ellipse key={angle} cx="32" cy="26" rx="5" ry="9" fill="#e8d697" transform={`rotate(${angle} 32 32)`} />)}<circle cx="32" cy="32" r="4" fill="#826d38" /></>}
    {index === 2 && <><path d="M32 4 40 23 61 24 45 38 50 59 32 47 14 59 19 38 3 24 24 23Z" fill="currentColor" /><path d="m32 14 0 30m-20-17 29 10m11-10-29 10" fill="none" stroke="#4c96c2" strokeWidth="2" /><circle cx="32" cy="32" r="6" fill="#ecf6f7" /></>}
    {index === 3 && <>{Array.from({ length: 12 }, (_, item) => <ellipse key={item} cx="32" cy="18" rx="4" ry="14" fill="currentColor" transform={`rotate(${item * 30} 32 32)`} />)}<circle cx="32" cy="32" r="10" fill="#6f4320" /><circle cx="29" cy="29" r="3" fill="#d58b30" /></>}
    {index === 4 && <><path d="M32 5v51" stroke="#91b590" strokeWidth="3" />{[[24, 14], [39, 18], [24, 28], [39, 32], [27, 42], [35, 47], [32, 57]].map(([x, y], item) => <ellipse key={item} cx={x} cy={y} rx={item === 6 ? 5 : 8} ry="7" fill="currentColor" opacity={1 - item * .035} />)}</>}
  </svg>
}

function SelectionMemory({ image, alt, label, line }: { image: string; alt: string; label: string; line: string }) {
  return <figure className="selection-memory" key={`${label}-${line}`}>
    <DisplayImage src={image} alt={alt} small />
    <figcaption><span>{label}</span><p>{line}</p></figcaption>
  </figure>
}

function Interaction({ chapter, petals, woven, wovenFlowers, plumChoice, duskFriends, duskActivity, onPetal, onWoven, onPlum, onDuskFriend, onDuskActivity, onAllFriends, onFinishDusk, onAdvance }: { chapter: number; petals: number[]; woven: number[]; wovenFlowers: Record<number, number>; plumChoice: Companion | null; duskFriends: Companion[]; duskActivity: DuskActivity | null; onPetal: (index: number) => void; onWoven: (index: number) => void; onPlum: (id: Companion) => void; onDuskFriend: (id: Companion) => void; onDuskActivity: (id: DuskActivity) => void; onAllFriends: () => void; onFinishDusk: () => void; onAdvance: () => void }) {
  if (chapter === 0) return <div className="interaction">
    <p className="prompt"><span aria-hidden="true">✦</span> 选三朵，装进口袋 <em aria-live="polite">{petals.length} / 3</em></p>
    <div className="petal-field">{flowers.map((flower, item) => <button key={flower.name} className={`petal petal-${item} ${petals.includes(item) ? 'picked' : ''}`} style={{ '--flower-color': flower.color } as CSSProperties} onClick={() => onPetal(item)} disabled={petals.length === 3 && !petals.includes(item)} aria-pressed={petals.includes(item)} aria-label={`${flower.name}，${flower.note}${petals.includes(item) ? '，已采下，再点可放回' : ''}`}><FlowerMark index={item} /><strong>{flower.name}</strong><small>{flower.note}</small><i aria-hidden="true">{petals.includes(item) ? '✓' : '+'}</i></button>)}</div>
    <p className="interaction-hint">{petals.length === 3 ? '三朵刚刚好。再点已选的花，也可以换一种。' : '每一种花，都有自己的颜色和模样。'}</p>
    <button className="next-button" disabled={petals.length < 3} onClick={onAdvance}>{petals.length < 3 ? `还差${3 - petals.length}朵花` : '带着花，继续走'} <span aria-hidden="true">↗</span></button>
    {petals.length > 0 && <SelectionMemory image={asset('generated/flower-field-v5.webp')} alt={`花田里采下的${petals.map((index) => flowers[index].name).join('、')}`} label="掌心里的春色" line={`${petals.map((index) => flowers[index].name).join('、')}落在掌心。${choiceLines[0]}`} />}
  </div>
  if (chapter === 1) return <div className="interaction">
    <p className="prompt"><span aria-hidden="true">✦</span> 点一下空位，把花编进去 <em aria-live="polite">{woven.length} / 4</em></p>
    <div className="wreath-board"><div className="wreath-ring"><span className="wreath-center">{woven.length === 4 ? '今日花事' : '慢慢来'}</span>{[0, 1, 2, 3].map((item) => {
      const flowerIndex = wovenFlowers[item] ?? petals[item % Math.max(petals.length, 1)] ?? item
      const flower = flowers[flowerIndex]
      return <button key={item} className={`wreath-slot slot-${item} ${woven.includes(item) ? 'filled' : ''}`} style={{ '--flower-color': flower.color } as CSSProperties} onClick={() => onWoven(item)} aria-pressed={woven.includes(item)} aria-label={woven.includes(item) ? `第${item + 1}处是${flower.name}，再点可换一种花` : `在第${item + 1}处编入花材`}><span className="slot-flower">{woven.includes(item) ? <FlowerMark index={flowerIndex} /> : '+'}</span><small>{woven.includes(item) ? flower.name : '添一朵'}</small></button>
    })}</div></div>
    <div className="wreath-legend">{petals.map((index) => <span key={index}><i style={{ background: flowers[index].color }} />{flowers[index].name} · {flowers[index].note.split(' · ')[0]}</span>)}</div>
    <p className="interaction-hint">{woven.length === 4 ? '不用对称，今天本来就各有各的好。' : '用刚才采下的三种花，为花环添四笔颜色。'}</p>
    <button className="next-button" disabled={woven.length < 4} onClick={onAdvance}>{woven.length < 4 ? '花环还差一点' : '戴上花环，去林下'} <span aria-hidden="true">↗</span></button>
    {woven.length > 0 && <SelectionMemory image={asset('generated/wreath-garden-v5.webp')} alt={`由${Object.values(wovenFlowers).map((index) => flowers[index].name).join('、')}编成的花环`} label="编进今天的花" line={`${Object.values(wovenFlowers).map((index) => flowers[index].name).join('、')}沿着枝条缠绕。${choiceLines[1]}`} />}
  </div>
  if (chapter === 2) return <div className="interaction">
    <p className="prompt"><span aria-hidden="true">✦</span> 这一颗青梅，给谁？</p>
    <div className="friend-row plum-row">{companions.map((friend) => <button key={friend.id} className={`friend-card plum-friend-card friend-${friend.id} ${plumChoice === friend.id ? 'chosen' : ''}`} onClick={() => onPlum(friend.id)} aria-pressed={plumChoice === friend.id}><DisplayImage className="avatar" src={friend.portrait} small alt="" /><span><strong>{friend.name}</strong><small>{friend.note}</small></span><i aria-hidden="true">{plumChoice === friend.id ? '✓' : '↗'}</i></button>)}</div>
    <p className="choice-reply" aria-live="polite">{plumChoice ? plumReplies[plumChoice] : '选一位朋友，听听她会说些什么。'}</p>
    <button className="next-button" disabled={!plumChoice} onClick={onAdvance}>带着笑意，去湖边 <span aria-hidden="true">↗</span></button>
    {plumChoice && <SelectionMemory image={companions.find((friend) => friend.id === plumChoice)!.portrait} alt={`${companions.find((friend) => friend.id === plumChoice)!.name}的肖像`} label={`递给${companions.find((friend) => friend.id === plumChoice)!.name}`} line={choiceLines[2]} />}
  </div>
  const duskNames = duskFriends.map((id) => companions.find((friend) => friend.id === id)!.name).join('、')
  const duskReply = duskActivity === 'wind' ? '风把湖水吹出细纹。大家安静下来，听见同一阵晚风。' : duskActivity === 'wreath' ? '花环传了一圈，最后谁戴着哪一朵，已经不重要。' : duskActivity === 'story' ? '一句“我跟你说”，把这个傍晚又悄悄拉长了一点。' : '等夕阳的时候，你们想做些什么？'
  return <div className="interaction">
    <p className="prompt"><span aria-hidden="true">✦</span> 和谁并肩？可以都选 <em aria-live="polite">{duskFriends.length} 人</em></p>
    <button className="group-button" onClick={onAllFriends} aria-pressed={duskFriends.length === companions.length}>{duskFriends.length === companions.length ? '已约上所有人 ✓' : '把大家都叫来 +'}</button>
    <div className="friend-row final-row">{companions.map((friend) => <button key={friend.id} className={`friend-card large-friend-card friend-${friend.id} ${duskFriends.includes(friend.id) ? 'chosen' : ''}`} onClick={() => onDuskFriend(friend.id)} aria-pressed={duskFriends.includes(friend.id)}><DisplayImage className="avatar" src={friend.portrait} small alt="" /><span><strong>{friend.name}</strong><small>{friend.note}</small></span><i aria-hidden="true">{duskFriends.includes(friend.id) ? '✓' : '+'}</i></button>)}</div>
    <div className="activity-row" role="group" aria-label="选择一起做的事">{duskActivities.map((item) => <button key={item.id} className={`activity-card ${duskActivity === item.id ? 'chosen' : ''}`} onClick={() => onDuskActivity(item.id)} aria-pressed={duskActivity === item.id}><b aria-hidden="true">{item.symbol}</b><span><strong>{item.title}</strong><small>{item.note}</small></span></button>)}</div>
    <p className="choice-reply" aria-live="polite">{duskFriends.length > 0 && duskActivity ? `${duskNames}坐到身边。${duskReply}` : duskReply}</p>
    <button className="next-button" disabled={duskFriends.length === 0 || !duskActivity} onClick={onFinishDusk}>{duskFriends.length === 0 ? '先选同行的人' : !duskActivity ? '再选一件小事' : '坐到天快黑'} <span aria-hidden="true">↗</span></button>
    {(duskFriends.length > 0 || duskActivity) && <SelectionMemory image={asset('generated/dusk-lake-v5.webp')} alt="朋友们在湖畔并肩看落日" label={duskFriends.length ? `${duskNames} · ${duskActivities.find((item) => item.id === duskActivity)?.title ?? '湖边相聚'}` : '湖畔的约定'} line={`${duskFriends.length ? `${duskNames}坐到身边。` : ''}${duskActivity ? duskReply : '风把湖水吹出细纹。大家安静下来，听见同一阵晚风。'}`} />}
  </div>
}

function FinishScreen({ companions: selectedCompanions, activity, petals, wovenFlowers, plumChoice, shots, exporting, exportProgress, exportUrl, exportError, isMusicOn, musicError, onToggleMusic, onExport, onCancelExport, onReset }: { companions: Companion[]; activity: DuskActivity; petals: number[]; wovenFlowers: Record<number, number>; plumChoice: Companion | null; shots: Shot[]; exporting: boolean; exportProgress: ExportProgress; exportUrl: string | null; exportError: string; isMusicOn: boolean; musicError: string; onToggleMusic: () => void; onExport: () => void; onCancelExport: () => void; onReset: () => void }) {
  const [shareMessage, setShareMessage] = useState('')
  const [previewShot, setPreviewShot] = useState<Shot | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const names = selectedCompanions.map((id) => companions.find((item) => item.id === id)?.name).filter(Boolean) as string[]
  const groupLabel = names.length > 1 ? `${names.slice(0, -1).join('、')}和${names[names.length - 1]}` : names[0] ?? '青禾'
  const activityName = duskActivities.find((item) => item.id === activity)?.title ?? '听一会儿风'
  const plumFriend = companions.find((friend) => friend.id === plumChoice)
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareMessage('游记链接已复制，发给想同行的人吧。')
    } catch {
      setShareMessage('复制浏览器地址栏，就能把这页游记分享出去。')
    }
  }
  const openPreview = (shot: Shot, event: ReactMouseEvent<HTMLButtonElement>) => {
    triggerRef.current = event.currentTarget
    setPreviewShot(shot)
  }
  const closePreview = () => setPreviewShot(null)
  useEffect(() => {
    if (!previewShot) return
    closeRef.current?.focus()
    const dialog = dialogRef.current
    if (!dialog) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closePreview()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    dialog.addEventListener('keydown', handleKeyDown)
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown)
      window.setTimeout(() => triggerRef.current?.focus(), 0)
    }
  }, [previewShot])
  return <main className="finish-shell" ><DisplayImage className="finish-photo" src={shots[5].image} mobileSrc={shots[5].mobileImage} eager alt="" /><div className="grain" aria-hidden="true" />
    <header className="topbar finish-top"><button className="wordmark" onClick={onReset} aria-label="重新开始游记"><span>花朝</span><strong>晚些回去</strong></button><div className="finish-top-actions"><span className="finish-tag">游记完成</span><MusicControl enabled={isMusicOn} error={musicError} onToggle={onToggleMusic} /></div></header>
    <div className="finish-grid"><section className="finish-copy"><div className="chapter-kicker"><span className="sun-mark" />你的花朝游记已经写好</div><h1 id="journey-title" tabIndex={-1}>晚些回去，<br /><i>也没有关系。</i></h1><p>你和{groupLabel}一起{activityName}，坐到了天快黑。六个片刻，收好这一日的光。</p>
      {petals.length > 0 && <div className="memory-flowers" aria-label="今天采下的花">{petals.map((index) => <span key={index}><FlowerMark index={index} />{flowers[index].name}</span>)}</div>}
      {plumFriend && <p className="memory-line">那颗青梅给了{plumFriend.name}，花环里留着你的配色。</p>}
      {Object.keys(wovenFlowers).length > 0 && <p className="wreath-memory-line">花环四处编进了{Object.values(wovenFlowers).map((index) => flowers[index]?.name).filter(Boolean).join('、')}。</p>}
      <div className="finish-actions">{exportUrl ? <a className="primary-action" href={exportUrl} download="wan-late-home-storyboard.zip">保存双版分镜包 <span>↓</span></a> : <button className={`primary-action ${exporting ? 'exporting' : ''}`} onClick={exporting ? onCancelExport : onExport} aria-busy={exporting}>{exporting ? '取消整理' : '收好今天的六个片刻'} <span>{exporting ? '×' : '↓'}</span></button>}<button className="secondary-action" onClick={share}>分享这页游记 <span>↗</span></button><button className="text-action" onClick={onReset}>再走一遍</button></div>
      {(exporting || exportProgress.stage === 'complete') && <p className="export-progress" role="status" aria-live="polite">{exportProgress.stage === 'packaging' ? `正在打包 · ${exportProgress.completed}/${exportProgress.total}` : exportProgress.stage === 'complete' ? `双版分镜包已准备好 · ${exportProgress.completed}/${exportProgress.total}` : `正在整理 ${exportProgress.completed}/${exportProgress.total}`}</p>}
      <p className="export-error" role="alert">{exportError}</p><p className="share-feedback" role="status">{shareMessage}</p>
      <div className="share-note">{selectedCompanions.length} 位同行者 · {activityName}<br />可保存横竖双版图片、字幕和分镜说明。链接会记住你的选择。</div>
    </section><section className="storyboard-preview" aria-label="游记分镜预览"><div className="preview-label"><span>把日子，留在光里</span><span>01 — 06</span></div><div className="shot-gallery">{shots.map((shot) => <button className="shot-thumbnail" type="button" key={shot.index} onClick={(event) => openPreview(shot, event)} aria-label={`查看第${shot.index}张分镜：${shot.title}`}><DisplayImage src={shot.image} alt="" small /><span>0{shot.index}</span><strong>{shot.title}</strong></button>)}</div><div className="preview-bottom">风从花梢里穿过去<br /><em>大家便都慢下来。</em></div></section></div>
    {previewShot && <div ref={dialogRef} className="shot-lightbox" role="dialog" aria-modal="true" aria-labelledby={`lightbox-title-${previewShot.index}`} aria-describedby={`lightbox-description-${previewShot.index}`} tabIndex={-1} onClick={(event) => { if (event.target === event.currentTarget) closePreview() }}><button ref={closeRef} type="button" className="lightbox-close" aria-label="关闭图片预览" onClick={closePreview}>×</button><DisplayImage key={previewShot.image} eager src={previewShot.image} alt={`${previewShot.title}。${previewShot.subtitle}`} onClick={(event) => event.stopPropagation()} /><div className="lightbox-caption"><span id={`lightbox-title-${previewShot.index}`}>0{previewShot.index} / 06 · {previewShot.title}</span><small id={`lightbox-description-${previewShot.index}`}>{previewShot.subtitle}</small></div></div>}
  </main>
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    const error = new Error('Export cancelled')
    error.name = 'AbortError'
    throw error
  }
}

function loadImage(src: string, signal?: AbortSignal) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const timer = window.setTimeout(() => { cleanup(); image.src = ''; reject(new Error('Image timeout')) }, 30_000)
    const abort = () => { cleanup(); image.src = ''; const error = new Error('Export cancelled'); error.name = 'AbortError'; reject(error) }
    const cleanup = () => { window.clearTimeout(timer); signal?.removeEventListener('abort', abort) }
    image.crossOrigin = 'anonymous'
    image.onload = () => { cleanup(); resolve(image) }
    image.onerror = () => { cleanup(); reject(new Error('Image unavailable')) }
    if (signal?.aborted) {
      abort()
      return
    }
    signal?.addEventListener('abort', abort, { once: true })
    image.src = src
  })
}
function csvCell(value: string | number) { return `"${String(value).replace(/"/g, '""')}"` }
function renderCrop(image: HTMLImageElement, width: number, height: number, vertical: boolean) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Canvas unavailable'))
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  // Keep upper faces intact in landscape; portrait masters have central safe margins.
  const x = (width - drawWidth) / 2
  const y = (height - drawHeight) * (vertical ? 0.5 : 0.15)
  ctx.drawImage(image, x, y, drawWidth, drawHeight)
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Canvas encode failed')), 'image/jpeg', 0.9))
}
async function blobToArrayBuffer(blob: Blob) { return await blob.arrayBuffer() }
function timecode(seconds: number) { const minutes = Math.floor(seconds / 60); const remainder = seconds % 60; return `00:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')},000` }

export default App

createRoot(document.getElementById('root')!).render(<App />)

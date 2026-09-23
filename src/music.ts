/** Plays the locally hosted, CC0 recording. No synthesized background layers. */
export class BackgroundMusic {
  private audio: HTMLAudioElement
  private requested = false
  private disposed = false
  private operation = 0
  private fadeTimer: number | undefined

  constructor(private onChange: (enabled: boolean) => void, private onError: (message: string) => void) {
    this.audio = new Audio(`${import.meta.env.BASE_URL}audio/lifewave-2k.mp3`)
    this.audio.preload = 'none'
    this.audio.loop = true
    this.audio.volume = 0
    this.audio.addEventListener('error', this.failed)
    document.addEventListener('visibilitychange', this.visibilityChanged)
  }

  async toggle() {
    if (this.requested) {
      this.requested = false
      ++this.operation
      this.onChange(false)
      this.fade(0, 450, () => this.audio.pause())
      return
    }
    this.requested = true
    this.onError('')
    this.onChange(true)
    await this.play()
  }

  private async play() {
    const operation = ++this.operation
    this.cancelFade()
    if (document.hidden || this.disposed) return
    try {
      await this.audio.play()
      if (operation !== this.operation || !this.requested || this.disposed) return
      this.fade(0.65, 1200)
    } catch {
      if (operation === this.operation && !this.disposed) this.failed()
    }
  }

  private failed = () => {
    if (this.disposed) return
    ++this.operation
    this.requested = false
    this.cancelFade()
    this.audio.pause()
    this.onChange(false)
    this.onError('音乐暂时无法播放，请再点一次重试。')
  }

  private visibilityChanged = () => {
    if (document.hidden) {
      ++this.operation
      this.cancelFade()
      this.audio.pause()
      this.audio.volume = 0
    } else if (this.requested) void this.play()
  }

  private cancelFade() {
    window.clearInterval(this.fadeTimer)
    this.fadeTimer = undefined
  }

  private fade(target: number, milliseconds: number, done?: () => void) {
    this.cancelFade()
    const from = this.audio.volume
    const start = performance.now()
    this.fadeTimer = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - start) / milliseconds)
      this.audio.volume = from + (target - from) * progress
      if (progress === 1) { this.cancelFade(); done?.() }
    }, 30)
  }

  dispose() {
    this.disposed = true
    ++this.operation
    this.cancelFade()
    document.removeEventListener('visibilitychange', this.visibilityChanged)
    this.audio.removeEventListener('error', this.failed)
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
  }
}

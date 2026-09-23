/** Original procedural ambience: broad leaf rustle and wind, not a field recording. */
const WIND_SAMPLE_RATE = 24_000
const WIND_SECONDS = 48
const CROSSFADE_SECONDS = 4
// Keep ambience below conversational foreground volume on small speakers.
const LISTENING_GAIN = 0.18

function randomSource(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** Kept separate from Web Audio so the actual waveform can be measured offline. */
export function synthesizeWind(seed = 0x57494e44): [Float32Array, Float32Array] {
  const length = WIND_SAMPLE_RATE * WIND_SECONDS
  const overlap = WIND_SAMPLE_RATE * CROSSFADE_SECONDS
  const rawLength = length + overlap
  const channels: [Float32Array, Float32Array] = [new Float32Array(rawLength), new Float32Array(rawLength)]
  const random = randomSource(seed)
  const coefficient = (frequency: number) => 1 - Math.exp(-2 * Math.PI * frequency / WIND_SAMPLE_RATE)
  // Sparse gusts with long rests sound like distant air moving through trees.
  // Continuous broadband noise was the source of the rain-like impression.
  const lowPass = coefficient(720)
  const highPass = coefficient(90)
  let noise = 0
  let body = 0
  const gustStarts = new Set<number>()
  for (let second = 1.5; second < WIND_SECONDS; second += 2.2 + random() * 2.8) {
    gustStarts.add(Math.round(second * WIND_SAMPLE_RATE))
  }
  let gustUntil = 0
  let gustStart = 0
  let gustStrength = 0
  for (let index = 0; index < rawLength; index += 1) {
    if (gustStarts.has(index)) {
      gustStart = index
      gustUntil = index + Math.round((0.8 + random() * 1.8) * WIND_SAMPLE_RATE)
      gustStrength = 0.12 + random() * 0.12
    }
    const progress = gustUntil > index ? (index - gustStart) / Math.max(1, gustUntil - gustStart) : 1
    const envelope = gustUntil > index ? Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI) : 0
    noise += lowPass * ((random() * 2 - 1) - noise)
    body += highPass * (noise - body)
    const sample = body * envelope * gustStrength
    channels[0][index] = sample * 0.95
    channels[1][index] = sample * 0.8
  }

  // Overlap the tail with the beginning. Equal-power weights avoid a quiet gap.
  // At the loop boundary, the two samples are adjacent in the original tail.
  const result: [Float32Array, Float32Array] = [new Float32Array(length), new Float32Array(length)]
  const smoothed: [Float32Array, Float32Array] = [new Float32Array(rawLength), new Float32Array(rawLength)]
  const toneCoefficient = coefficient(1750)
  for (let channel = 0; channel < 2; channel += 1) {
    let tone = 0
    for (let index = 0; index < rawLength; index += 1) {
      tone += toneCoefficient * (channels[channel][index] - tone)
      smoothed[channel][index] = tone
    }
  }
  let sumSquares = 0
  let peak = 0
  for (let channel = 0; channel < 2; channel += 1) {
    const raw = smoothed[channel]
    const output = result[channel]
    for (let index = 0; index < length; index += 1) {
      const phase = index / overlap * Math.PI / 2
      const sample = index < overlap
        ? raw[length + index] * Math.cos(phase) + raw[index] * Math.sin(phase)
        : raw[index]
      output[index] = sample
      sumSquares += sample * sample
      peak = Math.max(peak, Math.abs(sample))
    }
  }
  const rms = Math.sqrt(sumSquares / (length * 2))
  const normalization = Math.min(0.16 / rms, 0.8 / peak)
  for (const channel of result) {
    for (let index = 0; index < length; index += 1) channel[index] *= normalization
  }
  return result
}

/** A quiet, non-rhythmic pentatonic music bed. It deliberately avoids drums and hiss. */
export function synthesizeQuietMusic(): [Float32Array, Float32Array] {
  const sampleRate = 24_000
  const seconds = 28
  const length = sampleRate * seconds
  const left = new Float32Array(length)
  const right = new Float32Array(length)
  const notes = [220, 261.63, 293.66, 329.63, 392]
  const step = 2.8
  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate
    const noteIndex = Math.floor(time / step) % notes.length
    const noteTime = time % step
    const attack = Math.min(1, noteTime / 0.35)
    const release = Math.min(1, (step - noteTime) / 1.2)
    const envelope = attack * release
    const frequency = notes[noteIndex]
    const tone = Math.sin(2 * Math.PI * frequency * time) * 0.55
      + Math.sin(2 * Math.PI * frequency * 2 * time) * 0.12
    const value = tone * envelope * 0.075
    left[index] = value
    right[index] = value * 0.82
  }
  return [left, right]
}

export class AmbientWind {
  private context: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null
  private gain: GainNode | null = null
  private pauseTimer: number | null = null
  private requested = false
  private active = false
  private disposed = false
  private operation = 0

  constructor(private onStateChange?: (enabled: boolean) => void) {
    document.addEventListener('visibilitychange', this.onVisibilityChange)
  }

  /** The listener's sound preference; a hidden page pauses without changing it. */
  get enabled() { return this.active }

  async toggle(): Promise<boolean> {
    if (this.requested) {
      this.stop()
      return false
    }
    return this.start()
  }

  /** Call from a user gesture. A failed browser audio permission leaves sound off. */
  async start(): Promise<boolean> {
    if (this.disposed) return false
    this.requested = true
    const operation = ++this.operation
    this.cancelPause()
    try {
      if (!this.context) this.initialize()
      const context = this.context!
      await context.resume()
      if (this.disposed || operation !== this.operation) return this.active
      if (context.state !== 'running') throw new Error('Audio is unavailable')
      this.setActive(true)
      if (document.hidden) this.fadeAndPause(0.15)
      else this.fadeTo(LISTENING_GAIN, 0.9)
      return true
    } catch {
      if (operation === this.operation) {
        this.requested = false
        this.setActive(false)
        this.fadeAndPause(0.05)
      }
      return false
    }
  }

  stop(): void {
    this.requested = false
    this.operation += 1
    this.setActive(false)
    this.fadeAndPause(0.45)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.requested = false
    this.operation += 1
    this.cancelPause()
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.source?.stop()
    this.source?.disconnect()
    this.gain?.disconnect()
    if (this.context) void this.context.close().catch(() => {})
    this.context = null
    this.source = null
    this.gain = null
    this.active = false
    // React unmount cleanup should not schedule another state update.
    this.onStateChange = undefined
  }

  private initialize() {
    const AudioContextConstructor = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextConstructor) throw new Error('Web Audio is unavailable')
    const context = new AudioContextConstructor()
    try {
      const channels = synthesizeWind()
      const buffer = context.createBuffer(2, channels[0].length, WIND_SAMPLE_RATE)
      channels.forEach((channel, index) => buffer.getChannelData(index).set(channel))
      const source = context.createBufferSource()
      const gain = context.createGain()
      gain.gain.value = 0
      source.buffer = buffer
      source.loop = true
      source.connect(gain).connect(context.destination)
      source.start()
      this.context = context
      this.source = source
      this.gain = gain
    } catch (error) {
      void context.close().catch(() => {})
      throw error
    }
  }

  private setActive(enabled: boolean) {
    if (this.active === enabled) return
    this.active = enabled
    this.onStateChange?.(enabled)
  }

  private fadeTo(value: number, seconds: number) {
    if (!this.context || !this.gain) return
    const parameter = this.gain.gain
    const now = this.context.currentTime
    if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now)
    else {
      const current = parameter.value
      parameter.cancelScheduledValues(now)
      parameter.setValueAtTime(current, now)
    }
    parameter.linearRampToValueAtTime(value, now + seconds)
  }

  private cancelPause() {
    if (this.pauseTimer !== null) window.clearTimeout(this.pauseTimer)
    this.pauseTimer = null
  }

  private fadeAndPause(seconds: number) {
    this.cancelPause()
    this.fadeTo(0, seconds)
    const context = this.context
    if (!context) return
    this.pauseTimer = window.setTimeout(() => {
      this.pauseTimer = null
      if (!this.disposed && (!this.requested || document.hidden)) {
        void context.suspend().catch(() => {})
      }
    }, seconds * 1000 + 40)
  }

  private onVisibilityChange = () => {
    if (document.hidden) this.fadeAndPause(0.15)
    else if (this.requested) void this.start()
  }
}

export class QuietMusic {
  private context: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null
  private gain: GainNode | null = null
  private active = false
  private disposed = false
  private operation = 0

  constructor(private onStateChange?: (enabled: boolean) => void) {}
  get enabled() { return this.active }

  async toggle(): Promise<boolean> {
    if (this.active) { this.stop(); return false }
    return this.start()
  }

  async start(): Promise<boolean> {
    if (this.disposed) return false
    const operation = ++this.operation
    try {
      if (!this.context) this.initialize()
      const context = this.context!
      await context.resume()
      if (operation !== this.operation || this.disposed) return this.active
      this.active = true
      this.onStateChange?.(true)
      this.fadeTo(0.32, 1.4)
      return true
    } catch {
      this.stop()
      return false
    }
  }

  stop() {
    this.operation += 1
    this.active = false
    this.onStateChange?.(false)
    this.fadeTo(0, 0.8)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.operation += 1
    this.source?.stop()
    this.source?.disconnect()
    this.gain?.disconnect()
    if (this.context) void this.context.close().catch(() => {})
    this.context = null
    this.source = null
    this.gain = null
    this.onStateChange = undefined
  }

  private initialize() {
    const AudioContextConstructor = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextConstructor) throw new Error('Web Audio is unavailable')
    const context = new AudioContextConstructor()
    try {
      const channels = synthesizeQuietMusic()
      const buffer = context.createBuffer(2, channels[0].length, 24_000)
      channels.forEach((channel, index) => buffer.getChannelData(index).set(channel))
      const source = context.createBufferSource()
      const gain = context.createGain()
      gain.gain.value = 0
      source.buffer = buffer
      source.loop = true
      source.connect(gain).connect(context.destination)
      source.start()
      this.context = context
      this.source = source
      this.gain = gain
    } catch (error) {
      void context.close().catch(() => {})
      throw error
    }
  }

  private fadeTo(value: number, seconds: number) {
    if (!this.context || !this.gain) return
    const now = this.context.currentTime
    const parameter = this.gain.gain
    if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now)
    else { parameter.cancelScheduledValues(now); parameter.setValueAtTime(parameter.value, now) }
    parameter.linearRampToValueAtTime(value, now + seconds)
  }
}

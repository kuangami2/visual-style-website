function playGestureSound(kind: 'pick' | 'weave') {
  const AudioContextConstructor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextConstructor) return
  let context: AudioContext
  try {
    context = new AudioContextConstructor()
    const now = context.currentTime
    const master = context.createGain()
    master.gain.setValueAtTime(kind === 'pick' ? 0.13 : 0.09, now)
    master.connect(context.destination)
    if (kind === 'pick') {
      const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.11), context.sampleRate)
      const data = buffer.getChannelData(0)
      for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length)
      const source = context.createBufferSource()
      const filter = context.createBiquadFilter()
      const envelope = context.createGain()
      source.buffer = buffer
      filter.type = 'bandpass'
      filter.frequency.value = 1700
      filter.Q.value = 0.7
      envelope.gain.setValueAtTime(0.65, now)
      envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.11)
      source.connect(filter).connect(envelope).connect(master)
      source.start(now)
      source.stop(now + 0.12)
    } else {
      ;[523.25, 783.99, 1046.5].forEach((frequency, index) => {
        const tone = context.createOscillator()
        const envelope = context.createGain()
        tone.type = 'sine'
        tone.frequency.setValueAtTime(frequency, now)
        envelope.gain.setValueAtTime(0.001, now)
        envelope.gain.linearRampToValueAtTime(0.22 / (index + 1), now + 0.035)
        envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.75 + index * 0.16)
        tone.connect(envelope).connect(master)
        tone.start(now + index * 0.055)
        tone.stop(now + 1 + index * 0.16)
      })
    }
    window.setTimeout(() => { void context.close().catch(() => {}) }, kind === 'pick' ? 500 : 1800)
  } catch {
    return
  }
}

export const playPickingSound = () => playGestureSound('pick')
export const playWeavingSound = () => playGestureSound('weave')


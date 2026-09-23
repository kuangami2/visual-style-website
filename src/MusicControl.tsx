export function MusicControl({ enabled, error, onToggle }: { enabled: boolean; error: string; onToggle: () => void }) {
  return <div className="music-control">
    <button className="quiet-button" onClick={onToggle} aria-pressed={enabled}><span className="music-dot" />{enabled ? '关闭音乐' : '播放音乐'}</button>
    <a className="music-credit" href="https://opengameart.org/content/calm-ambient-3-lifewave-2k" target="_blank" rel="noreferrer">Lifewave 2k · The Cynic Project · CC0</a>
    {error && <span className="music-error" role="status">{error}</span>}
  </div>
}

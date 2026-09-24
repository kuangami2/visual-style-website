import { useEffect, useState, type MouseEventHandler } from 'react'

export function DisplayImage({ src, mobileSrc, small = false, eager = false, alt, className, onClick }: {
  src: string; mobileSrc?: string; small?: boolean; eager?: boolean; alt: string; className?: string; onClick?: MouseEventHandler<HTMLImageElement>
}) {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 600px)').matches)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const selected = mobile && mobileSrc ? mobileSrc : src
  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)')
    const update = () => setMobile(media.matches)
    media.addListener(update)
    return () => media.removeListener(update)
  }, [])
  useEffect(() => { setAttempt(0); setFailed(false); setRetry(0) }, [selected])
  const url = selected.replace(/\.webp$/, `-${small ? 'thumb' : 'screen'}.${attempt ? 'jpg' : 'webp'}`)
  const restart = () => { setFailed(false); setAttempt(0); setRetry(Date.now()) }
  useEffect(() => {
    if (!failed) return
    window.addEventListener('online', restart)
    return () => window.removeEventListener('online', restart)
  }, [failed])
  return <>
    <img className={className} src={url + (retry ? `?retry=${retry}` : '')} alt={alt}
      loading={eager ? 'eager' : 'lazy'} decoding="async" fetchPriority={eager ? 'high' : 'low'}
      onClick={onClick} onError={() => { if (!attempt) setAttempt(1); else setFailed(true) }} />
    {failed && <span className="image-retry" role="status" onClick={(event) => { event.stopPropagation(); restart() }}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); restart() } }}
      tabIndex={0} role-description="重新加载图片">图片未加载，点此重试</span>}
  </>
}

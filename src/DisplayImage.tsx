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
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
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
      loading={eager ? 'eager' : 'lazy'} decoding="async"
      onClick={onClick} onError={() => { if (!attempt) setAttempt(1); else setFailed(true) }} />
    {failed && <button type="button" className="image-retry" aria-label="重新加载图片" onClick={(event) => { event.stopPropagation(); restart() }}>图片未加载，点此重试</button>}
  </>
}

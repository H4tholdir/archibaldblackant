import { useState, useEffect, useRef } from 'react'
import { useArucoDetector } from './useArucoDetector'

type LiveArucoResult = {
  detected: boolean
  pxPerMm:  number | null
}

/**
 * Esegue ARUco detection in continuo sul feed video (1 fps) mentre active=true.
 * pxPerMm conserva l'ultimo valore rilevato con successo fino al reset.
 */
export function useLiveArucoDetector(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active:   boolean,
): LiveArucoResult {
  const [result, setResult] = useState<LiveArucoResult>({ detected: false, pxPerMm: null })
  const detectAruco = useArucoDetector()
  const busyRef     = useRef(false)

  useEffect(() => {
    if (!active) {
      setResult({ detected: false, pxPerMm: null })
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const scan = async () => {
      if (cancelled) return
      if (busyRef.current) {
        timer = setTimeout(scan, 500)
        return
      }

      const video = videoRef.current
      if (!video || video.videoWidth === 0) {
        timer = setTimeout(scan, 500)
        return
      }

      busyRef.current = true
      try {
        const maxDim  = 640
        const scale   = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight))
        const canvas  = document.createElement('canvas')
        canvas.width  = Math.round(video.videoWidth  * scale)
        canvas.height = Math.round(video.videoHeight * scale)
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const base64 = canvas.toDataURL('image/jpeg', 0.75).replace(/^data:image\/\w+;base64,/, '')

        const detection = await detectAruco(base64)
        if (!cancelled) {
          setResult(prev => ({
            detected: detection.detected,
            // Conserva l'ultimo pxPerMm noto finché la sessione è attiva
            pxPerMm:  detection.pxPerMm ?? prev.pxPerMm,
          }))
        }
      } finally {
        busyRef.current = false
        if (!cancelled) timer = setTimeout(scan, 1000)
      }
    }

    // Piccolo delay iniziale per dare tempo alla camera di warm-up
    timer = setTimeout(scan, 400)

    return () => {
      cancelled = true
      if (timer != null) clearTimeout(timer)
    }
  }, [active, videoRef, detectAruco])

  return result
}

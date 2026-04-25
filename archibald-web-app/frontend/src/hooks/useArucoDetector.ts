import { useCallback } from 'react'

type ArucoResult = { detected: boolean; pxPerMm: number | null }

export function useArucoDetector(): (imageBase64: string) => Promise<ArucoResult> {
  return useCallback(async (imageBase64: string): Promise<ArucoResult> => {
    return new Promise((resolve) => {
      let worker: Worker | null = null
      try {
        worker = new Worker(
          new URL('../workers/aruco-detector.worker.ts', import.meta.url),
          { type: 'module' },
        )
      } catch {
        resolve({ detected: false, pxPerMm: null })
        return
      }

      const cleanup = () => { try { worker?.terminate() } catch { /* no-op */ } }

      worker.onerror = () => { cleanup(); resolve({ detected: false, pxPerMm: null }) }

      worker.onmessage = (e: MessageEvent<ArucoResult>) => {
        cleanup()
        resolve(e.data)
      }

      const img = new Image()
      img.onload = () => {
        try {
          const maxDim  = 1280
          const scale   = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1))
          const canvas  = document.createElement('canvas')
          canvas.width  = Math.round(img.width * scale)
          canvas.height = Math.round(img.height * scale)
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (!ctx) { cleanup(); resolve({ detected: false, pxPerMm: null }); return }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          worker!.postMessage({ imageData }, [imageData.data.buffer])
        } catch {
          cleanup()
          resolve({ detected: false, pxPerMm: null })
        }
      }
      img.onerror = () => { cleanup(); resolve({ detected: false, pxPerMm: null }) }
      img.src = `data:image/jpeg;base64,${imageBase64}`
    })
  }, [])
}

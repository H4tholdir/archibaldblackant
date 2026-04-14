import { fetchWithRetry } from '../utils/fetch-with-retry'
import type { Promotion, CreatePromotionPayload, UpdatePromotionPayload } from '../types/promotion'

export async function fetchActivePromotions(): Promise<Promotion[]> {
  const res = await fetchWithRetry('/api/promotions/active')
  if (!res.ok) throw new Error('Failed to fetch active promotions')
  return res.json() as Promise<Promotion[]>
}

export async function fetchAllPromotions(): Promise<Promotion[]> {
  const res = await fetchWithRetry('/api/promotions')
  if (!res.ok) throw new Error('Failed to fetch promotions')
  return res.json() as Promise<Promotion[]>
}

export async function createPromotion(payload: CreatePromotionPayload): Promise<Promotion> {
  const res = await fetchWithRetry('/api/promotions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to create promotion')
  return res.json() as Promise<Promotion>
}

export async function updatePromotion(id: string, payload: UpdatePromotionPayload): Promise<Promotion> {
  const res = await fetchWithRetry(`/api/promotions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to update promotion')
  return res.json() as Promise<Promotion>
}

export async function deletePromotion(id: string): Promise<void> {
  const res = await fetchWithRetry(`/api/promotions/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete promotion')
}

export async function uploadPromotionPdf(id: string, file: File): Promise<Promotion> {
  const form = new FormData()
  form.append('pdf', file)
  const res = await fetchWithRetry(`/api/promotions/${id}/pdf`, { method: 'POST', body: form })
  if (!res.ok) throw new Error('Failed to upload PDF')
  return res.json() as Promise<Promotion>
}

export function getPromotionPdfUrl(id: string): string {
  return `/api/promotions/${id}/pdf`
}

export async function downloadPromotionPdf(id: string): Promise<void> {
  const token = localStorage.getItem('archibald_jwt')
  const res = await fetch(`/api/promotions/${id}/pdf`, {
    headers: { Authorization: `Bearer ${token ?? ''}` },
  })
  if (!res.ok) return
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

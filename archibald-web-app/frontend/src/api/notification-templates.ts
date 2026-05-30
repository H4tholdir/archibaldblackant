import type { NotificationTemplate } from '../types/notification-templates';

const getToken = () => localStorage.getItem('archibald_jwt') ?? '';
const h = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

export async function fetchTemplates(): Promise<NotificationTemplate[]> {
  const res = await fetch('/api/notification-templates', { headers: h() });
  if (!res.ok) return [];
  return ((await res.json()) as { data: NotificationTemplate[] }).data;
}

export async function saveTemplate(template: NotificationTemplate): Promise<NotificationTemplate> {
  const res = await fetch('/api/notification-templates', {
    method: 'PUT', headers: h(), body: JSON.stringify(template),
  });
  if (!res.ok) throw new Error('Salvataggio fallito');
  return ((await res.json()) as { data: NotificationTemplate }).data;
}

export async function deleteTemplate(id: number): Promise<void> {
  await fetch(`/api/notification-templates/${id}`, { method: 'DELETE', headers: h() });
}

import fetch from 'node-fetch';

const API = process.env.API_URL || 'https://formicanera.com/api';
const TOKEN = process.env.E2E_TOKEN;

const createdOrderIds = [];

function headers() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` };
}

export function trackOrderId(orderId) {
  createdOrderIds.push(orderId);
  console.log(`[cleanup] Tracked orderId: ${orderId}`);
}

export async function deleteOrderViaApi(orderId) {
  const response = await fetch(`${API}/agent-queue/submit`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ tasks: [{ type: 'delete-order', payload: { orderId } }] }),
  });
  if (!response.ok) {
    console.error(`[cleanup] Failed to delete ${orderId}: ${response.status}`);
    return false;
  }
  return true;
}

export async function cleanupAll() {
  if (createdOrderIds.length === 0) {
    console.log('[cleanup] Nothing to clean up');
    return;
  }
  console.log(`[cleanup] Cleaning up ${createdOrderIds.length} order(s)...`);
  for (const id of createdOrderIds) {
    try {
      await deleteOrderViaApi(id);
      console.log(`[cleanup] Deleted: ${id}`);
    } catch (err) {
      console.error(`[cleanup] Failed ${id}:`, err.message);
    }
  }
}

export async function postJson(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getJson(path) {
  const res = await fetch(`${API}${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function waitForTaskComplete(taskId, timeoutMs = 600_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await getJson('/agent-queue/state');
    const recent = state.recent ?? [];
    const active = state.active ?? [];
    const task = [...recent, ...active].find(t => t.taskId === taskId);
    if (task?.status === 'completed') return { success: true, orderId: task.payload?.orderId };
    if (task?.status === 'failed' || task?.status === 'cancelled') {
      return { success: false, error: task.errorMessage ?? 'Task failed' };
    }
    await new Promise(r => setTimeout(r, 5000));
    process.stdout.write('.');
  }
  throw new Error(`Task ${taskId} timed out after ${timeoutMs / 1000}s`);
}

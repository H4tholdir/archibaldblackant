const JINA_API_URL = 'https://api.jina.ai/v1/embeddings'
const JINA_MODEL   = 'jina-embeddings-v4'

export type EmbeddingTask = 'retrieval.passage' | 'retrieval.query'

export type VisualEmbeddingService = {
  embedImage(imageBase64: string, task: EmbeddingTask): Promise<number[]>
}

export function createVisualEmbeddingService(apiKey: string): VisualEmbeddingService {
  return {
    embedImage: (imageBase64, task) => embedImage(apiKey, imageBase64, task),
  }
}

async function embedImage(
  apiKey:      string,
  imageBase64: string,
  task:        EmbeddingTask,
): Promise<number[]> {
  const response = await fetch(JINA_API_URL, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: JINA_MODEL,
      task,
      input: [{ image: `data:image/jpeg;base64,${imageBase64}` }],
    }),
  })

  if (!response.ok) {
    throw new Error(`Jina API error: ${response.status}`)
  }

  const data      = await response.json() as { data: Array<{ embedding: number[] }> }
  const embedding = data.data[0]?.embedding
  if (!embedding?.length) throw new Error('Jina API returned empty embedding')
  return embedding
}

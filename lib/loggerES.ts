import client from './client'

async function logEvent (eventType: string, details: object): Promise<void> {
  const timestamp = new Date().toISOString()
  try {
    await client.index({
      index: 'logs_juice',
      body: {
        eventType,
        details,
        timestamp
      }
    })
  } catch (error) {
    console.error('Error al enviar el log en Elasticsearch:', error)
  }
}

export default logEvent

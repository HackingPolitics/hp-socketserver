import { onListenPayload, Server } from './hocuspocus'
import { HpBridge } from './HpBridge'

const server = Server.configure({
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 1234,
  async onListen(data: onListenPayload) {
    // eslint-disable-next-line no-console
    console.log(`HP-Websocket listening on port ${data.port}...`)
  },
  extensions: [
    new HpBridge({ url: process.env.API_URL }),
  ],
})

server.listen()

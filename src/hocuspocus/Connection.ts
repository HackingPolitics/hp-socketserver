import AsyncLock from 'async-lock'
import WebSocket from 'ws'
import { IncomingMessage as HTTPIncomingMessage } from 'http'

import { readVarString } from 'lib0/decoding'
import Document from './Document'
import { IncomingMessage } from './IncomingMessage'
import { jwtHelper } from './JwtHelper'
import { MessageType, WsReadyStates } from './types'
import { OutgoingMessage } from './OutgoingMessage'

class Connection {

  connection: WebSocket

  context: any

  document: Document

  pingInterval: NodeJS.Timeout

  pongReceived = true

  request: HTTPIncomingMessage

  timeout: number

  timer: any

  callbacks: any = {
    onClose: (document: Document) => null,
  }

  socketId: string

  lock: AsyncLock

  readOnly: Boolean

  /**
   * Constructor.
   */
  constructor(
    connection: WebSocket,
    request: HTTPIncomingMessage,
    document: Document,
    timeout: number,
    socketId: string,
    context: any,
    readOnly = false,
  ) {
    this.connection = connection
    this.context = context
    this.document = document
    this.request = request
    this.timeout = timeout
    this.socketId = socketId
    this.readOnly = readOnly

    this.lock = new AsyncLock()

    this.connection.binaryType = 'arraybuffer'
    this.document.addConnection(this)

    this.pingInterval = setInterval(this.check.bind(this), this.timeout)

    this.connection.on('close', this.close.bind(this))
    this.connection.on('message', this.handleMessage.bind(this))
    this.connection.on('pong', () => { this.pongReceived = true })

    // disconnect when the JWT expires
    this.checkTokenExpiration()

    this.sendFirstSyncStep()
  }

  checkTokenExpiration() {
    const ttl = this.context.expires * 1000 - Date.now()
    if (ttl <= 0) {
      console.error(`User ${this.context.user} disconnected, JWT expired`)
      this.close()

      return
    }

    if (this.timer) {
      clearTimeout(this.timer)
    }

    this.timer = setTimeout(this.checkTokenExpiration.bind(this), ttl)
    // console.debug(`Checking token for user ${this.context.user} (again) in ${ttl / 1000}s`)
  }

  /**
   * Set a callback that will be triggered when the connection is closed
   */
  onClose(callback: (document: Document) => void): Connection {
    this.callbacks.onClose = callback

    return this
  }

  /**
   * Send the given message
   */
  send(message: any): void {
    if (
      this.connection.readyState === WsReadyStates.Closing
      || this.connection.readyState === WsReadyStates.Closed
    ) {
      this.close()
    }

    try {
      this.connection.send(message, (error: any) => {
        if (error != null) this.close()
      })
    } catch (exception) {
      this.close()
    }
  }

  /**
   * Close the connection
   */
  close(): void {
    this.lock.acquire('close', (done: Function) => {

      if (this.pingInterval) {
        clearInterval(this.pingInterval)
      }

      if (!this.document.hasConnection(this)) {
        return
      }

      this.document.removeConnection(this)
      this.callbacks.onClose(this.document)
      this.connection.close()

      if (this.timer) {
        clearTimeout(this.timer)
      }

      done()
    })
  }

  /**
   * Check if pong was received and close the connection otherwise
   * @private
   */
  private check(): void {
    if (!this.pongReceived) {
      return this.close()
    }

    if (this.document.hasConnection(this)) {
      this.pongReceived = false

      try {
        this.connection.ping()
      } catch (exception) {
        this.close()
      }
    }
  }

  /**
   * Send first sync step
   * @private
   */
  private sendFirstSyncStep(): void {
    this.send(
      new OutgoingMessage()
        .createSyncMessage()
        .writeFirstSyncStepFor(this.document)
        .toUint8Array(),
    )

    if (!this.document.hasAwarenessStates()) {
      return
    }

    this.send(
      new OutgoingMessage()
        .createAwarenessUpdateMessage(this.document.awareness)
        .toUint8Array(),
    )
  }

  /**
   * Handle an incoming message
   * @private
   */
  private handleMessage(input: Iterable<number>): void {
    const message = new IncomingMessage(input)
    const mtype = message.type

    // this allows the client to send us a new JWT, we check expiration & allowed projects and
    // then store it in the context to use it for pushes to the backend
    if (mtype === MessageType.TokenUpdate) {
      const token = readVarString(message.decoder)
      try {
        this.context = jwtHelper.verify(token, this.context.project)
        this.checkTokenExpiration()
      } catch (err) {
        console.error(`JWT verification failed on TokenUpdateMessage: ${err.message}`)
        this.close()
      }

      // do not continue, especially do not send this message to the other clients
      return
    }

    if (mtype === MessageType.Awareness) {
      this.document.applyAwarenessUpdate(this, message.readUint8Array())
      return
    }

    // Failsave
    if (mtype !== MessageType.Sync) {
      return
    }

    message.readSyncMessageAndApplyItTo(this.document, this)

    if (message.length <= 1) {
      return
    }

    return this.send(
      message.toUint8Array(),
    )
  }

  /**
   * Get the underlying connection instance
   */
  get instance(): WebSocket {
    return this.connection
  }
}

export default Connection

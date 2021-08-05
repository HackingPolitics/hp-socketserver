import { YMap } from 'yjs/dist/src/internals'
import { TiptapTransformer } from '@hocuspocus/transformer'
import {
  Extension,
  onChangePayload,
  onConfigurePayload,
  onConnectPayload,
  onCreateDocumentPayload,
  onDestroyPayload,
  onDisconnectPayload,
  onListenPayload,
  onRequestPayload,
  onUpgradePayload,
} from './hocuspocus'
import Timeout = NodeJS.Timeout
import { HydraClient } from './HydraClient'
import { HpoContext, jwtHelper } from './hocuspocus/JwtHelper'

export interface Configuration {
  debounce: number | false | null,
  debounceMaxWait: number,
  url: string,
}

export class HpBridge implements Extension {

  client: HydraClient

  configuration: Configuration = {
    debounce: 2000,
    debounceMaxWait: 10000,
    url: '',
  }

  debounced: Map<string, { timeout: Timeout, start: number }> = new Map()

  constructor(configuration?: Partial<Configuration>) {
    this.configuration = {
      ...this.configuration,
      ...configuration,
    }

    if (!this.configuration.url) {
      throw new Error('url is required!')
    }

    this.client = new HydraClient(this.configuration.url)

  }

  async onConnect(data: onConnectPayload) {
    const token = data.requestParameters.get('authToken')
    if (!token) {
      throw new Error('Connect without token!')
    }

    const dashPos = data.documentName.indexOf('-')
    if (dashPos <= 0) {
      throw new Error('Connect with invalid document name')
    }

    let context: HpoContext

    const type = data.documentName.substring(0, dashPos)
    const requestedId = Number.parseInt(data.documentName.replace(`${type}-`, ''), 10)

    switch (type) {
      case 'project':
      case 'proposal':
        context = jwtHelper.verify(token, type, requestedId)
        break

      default:
        throw new Error(`Unknown type ${type}`)
    }

    // eslint-disable-next-line no-console
    console.debug(`User ${context.user} connected to ${type} ${requestedId}`)

    // this will be attached to the connection and is available in the onChange hook
    return context
  }

  async onCreateDocument(data: onCreateDocumentPayload) {
    if (data.context.type !== 'proposal') {
      return
    }

    const response = await this.client.get(
      `/proposals/${data.context.id}/collab`,
      undefined,
      { headers: { Authorization: `Bearer ${data.context.token}` } },
    )

    if (!response || !response.collabData) {
      throw new Error('Could not load proposal, invalid or empty response received from the backend!')
    }

    Object.keys(response.collabData).forEach(key => {
      const field = TiptapTransformer.toYdoc(response.collabData[key], key)
      data.document.merge(field)
    })

    const syncState: YMap<any> = data.document.getMap('syncState')
    syncState.set('savedAt', 0)

    // eslint-disable-next-line no-console
    console.debug(`Loaded proposal ${data.context.id} from the backend`)

    // no need to return a document as we already modified the provided new document
  }

  /**
   * onChange hook
   */
  async onChange(data: onChangePayload) {
    if (!data.context.token) {
      return
    }

    if (data.context.type !== 'proposal') {
      return
    }

    // console.debug(`Document ${data.documentName} changed by user ${data.context.user}`)

    const save = async () => {
      try {
        await this.client.post(
          `/proposals/${data.context.id}/collab`,
          {
            collabData: {
              actionMandate: TiptapTransformer.fromYdoc(data.document, 'actionMandate'),
              comment: TiptapTransformer.fromYdoc(data.document, 'comment'),
              introduction: TiptapTransformer.fromYdoc(data.document, 'introduction'),
              reasoning: TiptapTransformer.fromYdoc(data.document, 'reasoning'),
            },
          },
          {
            headers: { Authorization: `Bearer ${data.context.token}` },
          },
        )
      } catch (err) {
        if (err.message) {
          console.error(`Pushing changes to backend server failed: ${err.message}`)

          return
        }
      }

      const now = Date.now()

      const syncState = data.document.share.get('syncState') as unknown as YMap<any>
      syncState.set('savedAt', now)

      // eslint-disable-next-line no-console
      console.debug(`Changes to proposal ${data.context.id} pushed to backend @${now}, impersonating user ${data.context.user}`)
    }

    if (!this.configuration.debounce) {
      return save()
    }

    this.debounce(data.documentName, save)
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function,no-empty-function
  async onDisconnect(data: onDisconnectPayload) {
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function,no-empty-function
  async onUpgrade(data: onUpgradePayload) {
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function,no-empty-function
  async onRequest(data: onRequestPayload) {
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function,no-empty-function
  async onListen(data: onListenPayload) {
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function,no-empty-function
  async onDestroy(data: onDestroyPayload) {
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function,no-empty-function
  async onConfigure(data: onConfigurePayload) {
  }

  /**
   * debounce the given function, using the given identifier
   */
  debounce(id: string, func: Function) {
    const old = this.debounced.get(id)
    const start = old?.start || Date.now()

    const run = () => {
      this.debounced.delete(id)
      func()
    }

    if (old?.timeout) clearTimeout(old.timeout)
    if (Date.now() - start >= this.configuration.debounceMaxWait) return run()

    this.debounced.set(id, {
      start,
      timeout: setTimeout(run, <number>this.configuration.debounce),
    })
  }
}

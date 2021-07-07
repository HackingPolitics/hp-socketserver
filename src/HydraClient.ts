import axios, {
  AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse,
} from 'axios'
import Qs from 'qs'

export const LD_MIME_TYPE = 'application/ld+json'

export enum RequestErrors {
  AccessDenied = 'Access Denied.',
  BadRequest = 'Bad Request',
  NotFound = 'Not Found',
}

export class HydraClient {
  public axios: AxiosInstance

  constructor(baseURL: string) {
    this.axios = axios.create({
      baseURL,
      headers: {
        Accept: LD_MIME_TYPE,
        'Content-Type': LD_MIME_TYPE,
      },
    })

    // Format nested params correctly
    this.axios.interceptors.request.use(config => {
      config.paramsSerializer = params => {
        return Qs.stringify(params, {
          arrayFormat: 'brackets',
          encode: false,
        }) as string
      }

      return config
    })
  }

  public get = (url: string, params: Record<string, unknown> = {}, config: AxiosRequestConfig = {}): Promise<any> => {
    config.method = 'get'
    config.params = params

    return this.request(url, config)
  }

  public post = (url: string, data: unknown, config: AxiosRequestConfig = {}): Promise<any> => {
    config.method = 'post'
    config.data = JSON.stringify(data)

    return this.request(url, config)
  }

  public put = (url: string, data: unknown, config: AxiosRequestConfig = {}): Promise<any> => {
    config.method = 'put'
    config.data = JSON.stringify(data)

    return this.request(url, config)
  }

  public delete = (url: string, config: AxiosRequestConfig = {}): Promise<any> => {
    config.method = 'delete'

    return this.request(url, config)
  }

  public request = (url: string, config: AxiosRequestConfig = {}): Promise<any> => {
    const axiosConfig = {
      ...config,
      url,
    }

    // the Authorization header is added via interceptor
    return this.axios.request(axiosConfig)
      .then((response: AxiosResponse) => response.data)
      .catch(this.handleError)
  }

  protected handleError = (err: AxiosError): void => {
    if (err.response) {
      const json = err.response.data

      if (json.violations) {
        throw new Error(JSON.stringify(json.violations))
      }

      const msg = json['hydra:description'] || json.message || err.response.statusText

      throw Error(msg)
    }

    // @todo log RequestError for monitoring

    if (err.request) {
      // `err.request` is an instance of XMLHttpRequest in the browser and an instance of
      // http.ClientRequest in node.js
      throw new Error('failure.noNetworkResponse')
    }

    throw new Error('failure.sendingRequest')
  }
}

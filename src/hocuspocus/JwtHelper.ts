import fs from 'fs'
import jwt, { JwtPayload } from 'jsonwebtoken'

export type HpoToken = JwtPayload & {
  username: string
  id: number
  editableProjects: number[]
  roles: string[]
}

export type HpoContext = {
  expires?: number
  id: number
  user: number
  token: string
  type: string
}

class JwtHelper {
  jwtKey: Buffer

  constructor(keyFile: string = process.env.JWT_KEYFILE || './public.pem') {
    // Load the key file once on startup.
    // When using PEM encoded keys, jwt.verify() only works with the public key.
    this.jwtKey = fs.readFileSync(keyFile)
  }

  verify(token: string, type = 'project', id = 0): HpoContext {
    // this will throw an error if verification or decoding failed or the token is expired,
    // dont catch it to let the handler know he should close the connection
    const decoded = jwt.verify(token, this.jwtKey) as HpoToken

    if (id > 0) {
      switch (type) {
        case 'project':
          if (!decoded.editableProjects.includes(id)) {
            const allowedIDs = decoded.editableProjects.join(', ')
            throw new Error(`${(new Date()).toISOString}: ${decoded.username} not allowed to access project ${id}, allowed: ${allowedIDs}`)
          }
          break

        case 'proposal':
          if (!decoded.editableProposals.includes(id)) {
            const allowedIDs = decoded.editableProposals.join(', ')
            throw new Error(`${(new Date()).toISOString}: ${decoded.username} not allowed to access proposal ${id}, allowed: ${allowedIDs}`)
          }
          break

        default:
          throw new Error(`Unknown type ${type}`)
      }
    }

    // this will be attached as context to the connection and is available in the onChange hook
    return {
      expires: decoded.exp,
      id,
      token,
      type,
      user: decoded.id,
    }
  }
}

// don't export the class but only the instance to simulate a singleton so we don't have
// to share functions & the loaded JWT key between the server, extension and connection
const instance = new JwtHelper()
export { instance as jwtHelper }

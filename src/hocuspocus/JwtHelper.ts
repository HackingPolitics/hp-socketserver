import fs from 'fs'
import jwt, { JwtPayload } from 'jsonwebtoken'

export type HpoToken = JwtPayload & {
  username: string
  id: number
  editableProjects: number[]
  roles: string[]
}

class JwtHelper {
  jwtKey: Buffer

  constructor(keyFile: string = process.env.JWT_KEYFILE || './public.pem') {
    // Load the key file once on startup.
    // When using PEM encoded keys, jwt.verify() only works with the public key.
    this.jwtKey = fs.readFileSync(keyFile)
  }

  verify(token: string, projectId = 0) {
    // this will throw an error if verification or decoding failed or the token is expired,
    // dont catch it to let the handler know he should close the connection
    const decoded = jwt.verify(token, this.jwtKey) as HpoToken

    const context = {
      expires: decoded.exp,
      project: projectId,
      token,
      user: decoded.id,
    }

    if (projectId > 0) {
      if (!decoded.editableProjects.includes(projectId)) {
        throw new Error(`Not allowed to access project ${projectId}`)
      }

      context.project = projectId
    }

    // this will be attached as context to the connection and is available in the onChange hook
    return context
  }
}

// don't export the class but only the instance to simulate a singleton so we don't have
// to share functions & the loaded JWT key between the server, extension and connection
const instance = new JwtHelper()
export { instance as jwtHelper }

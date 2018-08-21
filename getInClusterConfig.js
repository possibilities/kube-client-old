const { readFile, exists } = require('fs-extra')
const https = require('https')

const host = process.env.KUBERNETES_SERVICE_HOST
const port = process.env.KUBERNETES_SERVICE_PORT

const caPath = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt'
const tokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token'

const getInClusterConfig = async () => {
  // If we're inside kubernetes we can pull all the values we need from
  // the filesystem
  if (host && port && await exists(caPath) && await exists(tokenPath)) {
    const agent = new https.Agent({ ca: await readFile(caPath, 'utf8') })
    return {
      agent,
      baseUrl: `https://${host}:${port}`,
      headers: { authorization: `Bearer ${await readFile(tokenPath, 'utf8')}` }
    }
  }
}

module.exports = getInClusterConfig

const { readFile, exists } = require('fs-extra')

const host = process.env.KUBERNETES_SERVICE_HOST
const port = process.env.KUBERNETES_SERVICE_PORT

const caPath = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt'
const tokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token'

const getInClusterConfig = async () => {
  // If we're inside kubernetes we can pull all the values we need from
  // the filesystem
  if (host && port && await exists(caPath) && await exists(tokenPath)) {
    return {
      baseUrl: `https://${host}:${port}`,
      ca: await readFile(caPath, 'utf8'),
      headers: { authorization: `Bearer ${await readFile(tokenPath, 'utf8')}` }
    }
  }
}

module.exports = getInClusterConfig

const { readFile } = require('fs-extra')

const host = process.env.KUBERNETES_SERVICE_HOST
const port = process.env.KUBERNETES_SERVICE_PORT

const caPath = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt'
const tokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token'

const findConfig = async () => {
  return {
    baseUrl: `https://${host}:${port}`,
    ca: await readFile(caPath, 'utf8'),
    headers: { authorization: `Bearer ${await readFile(tokenPath, 'utf8')}` }
  }
}

module.exports = findConfig

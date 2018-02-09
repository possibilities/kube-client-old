const { readFileSync } = require('fs')

const host = process.env.KUBERNETES_SERVICE_HOST
const port = process.env.KUBERNETES_SERVICE_PORT

const caPath = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt'
const tokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token'

const findConfigSync = () => {
  return {
    baseUrl: `https://${host}:${port}`,
    ca: readFileSync(caPath, 'utf8'),
    headers: { authorization: `Bearer ${readFileSync(tokenPath, 'utf8')}` }
  }
}

module.exports = findConfigSync

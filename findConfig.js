const { join: joinPath } = require('path')
const { readFile, exists } = require('fs-extra')
const { exec } = require('child-process-promise')
const { safeLoad: readYaml } = require('js-yaml-promise')

const host = process.env.KUBERNETES_SERVICE_HOST
const port = process.env.KUBERNETES_SERVICE_PORT

const caPath = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt'
const tokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token'

const decode = encoded => Buffer.from(encoded, 'base64').toString()

const findConfig = async () => {
  if (await exists(caPath) && await exists(tokenPath)) {
    return {
      baseUrl: `https://${host}:${port}`,
      ca: await readFile(caPath, 'utf8'),
      headers: { authorization: `Bearer ${await readFile(tokenPath, 'utf8')}` }
    }
  }

  const configPath = joinPath(process.env.HOME, '.kube', 'config')
  const configString = await readFile(configPath, 'utf8')
  const config = await readYaml(configString)
  const currentContextName = config['current-context']
  const currentContext = config.contexts.find(context => context.name === currentContextName)
  const cluster = config.clusters.find(cluster => cluster.name === currentContext.context.cluster).cluster
  const user = config.users.find(user => user.name === currentContext.context.user).user

  // TODO A bit brute, can probably find these values through ~/.kube/config
  // more naturally
  if (currentContextName === 'minikube') {
    return {
      baseUrl: cluster.server,
      cert: await readFile(user['client-certificate'], 'utf8'),
      key: await readFile(user['client-key'], 'utf8'),
      ca: await readFile(cluster['certificate-authority'], 'utf8')
    }
  }

  const { stdout: secretString } = await exec('kubectl get secret -ojson')
  const { items: secrets } = JSON.parse(secretString)
  const defaultSecret = secrets.find(secret => secret.metadata.name.startsWith('default-token-'))

  if (currentContextName === 'docker-for-desktop') {
    return {
      baseUrl: cluster.server,
      rejectUnauthorized: false,
      cert: decode(user['client-certificate-data']),
      key: decode(user['client-key-data']),
      headers: { authorization: `Bearer ${defaultSecret.data.token}` }
    }
  }

  return {
    baseUrl: cluster.server,
    headers: { authorization: `Bearer ${defaultSecret.data.token}` }
  }
}

module.exports = findConfig

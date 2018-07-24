const { join: joinPath } = require('path')
const { exec } = require('child-process-promise')
const { readFile, exists } = require('fs-extra')
const { safeLoad: readYaml } = require('js-yaml-promise')
const get = require('lodash/get')

const host = process.env.KUBERNETES_SERVICE_HOST
const port = process.env.KUBERNETES_SERVICE_PORT

const caPath = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt'
const tokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token'

const decode = encoded => Buffer.from(encoded, 'base64').toString()

const keyForUser = user => {
  if (get(user, 'client-key')) {
    return readFile(get(user, 'client-key'), 'utf8')
  }
  if (get(user, 'client-key-data')) {
    return decode(get(user, 'client-key-data'))
  }
}

const certForUser = user => {
  if (get(user, 'client-certificate')) {
    return readFile(get(user, 'client-certificate'), 'utf8')
  }
  if (get(user, 'client-certificate-data')) {
    return decode(get(user, 'client-certificate-data'))
  }
}

const findConfig = async () => {
  // If we're inside kubernetes we can pull all the values we need from
  // the filesystem
  if (await exists(caPath) && await exists(tokenPath)) {
    return {
      baseUrl: `https://${host}:${port}`,
      ca: await readFile(caPath, 'utf8'),
      headers: { authorization: `Bearer ${await readFile(tokenPath, 'utf8')}` }
    }
  }

  // If we're outside of kubernetes we manually parse out everything we need
  // from ~/.kube/config
  const configPath = joinPath(process.env.HOME, '.kube', 'config')
  const configString = await readFile(configPath, 'utf8')
  const config = await readYaml(configString)
  const currentContextName = config['current-context']
  const currentContext = config.contexts.find(context => context.name === currentContextName)
  const cluster = config.clusters.find(cluster => cluster.name === currentContext.context.cluster).cluster
  const user = get(config.users.find(user => user.name === currentContext.context.user), 'user')

  const { stdout: secretString } = await exec('kubectl get secret -ojson')
  const { items: secrets } = JSON.parse(secretString)
  const { token } = secrets.find(secret => secret.metadata.name.startsWith('default-token-')).data

  // Dynamic config based on current context
  return {
    baseUrl: cluster.server,
    rejectUnauthorized: !(cluster['insecure-skip-tls-verify'] && cluster.server.startsWith('https')),
    key: await keyForUser(user),
    cert: await certForUser(user),
    ca: cluster['certificate-authority']
      ? await readFile(cluster['certificate-authority'], 'utf8')
      : undefined,
    headers: cluster['certificate-authority']
      ? undefined
      : { authorization: `Bearer ${token}` }
  }
}

module.exports = findConfig

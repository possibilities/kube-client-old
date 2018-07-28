const { join: joinPath } = require('path')
const { readFile } = require('fs-extra')
const { safeLoad: readYaml } = require('js-yaml-promise')
const get = require('lodash/get')

const decode = encoded => Buffer.from(encoded, 'base64').toString()
const encode = decoded => Buffer.from(decoded).toString('base64')

const isBase64 = str => {
  try {
    return encode(decode(str)) === str
  } catch (err) {
    return false
  }
}

const ensureDecoded = maybeEncoded => {
  return isBase64(maybeEncoded) ? decode(maybeEncoded) : maybeEncoded
}

const getKubectlConfig = async contextName => {
  const kubeConfigPath = joinPath(process.env.HOME, '.kube', 'config')
  const kubeConfigString = await readFile(kubeConfigPath, 'utf8')
  const kubeConfig = await readYaml(kubeConfigString)
  const currentContextName = contextName || kubeConfig['current-context']
  const currentContext = kubeConfig.contexts.find(context => context.name === currentContextName)
  const cluster = kubeConfig.clusters.find(cluster => cluster.name === currentContext.context.cluster).cluster
  const user = get(kubeConfig.users.find(user => user.name === currentContext.context.user), 'user')

  let config = { cluster, user }

  if (config.cluster['certificate-authority']) {
    config = {
      ...config,
      cluster: {
        ...config.cluster,
        'certificate-authority-data': await readFile(config.cluster['certificate-authority'], 'utf8')
      }
    }
  }

  if (config.user && config.user['client-certificate']) {
    config = {
      ...config,
      user: {
        ...config.user,
        'client-certificate-data': await readFile(config.user['client-certificate'], 'utf8')
      }
    }
  }

  if (config.user && config.user['client-key']) {
    config = {
      ...config,
      user: {
        ...config.user,
        'client-key-data': await readFile(config.user['client-key'], 'utf8')
      }
    }
  }

  if (config.user && config.user['client-certificate-data']) {
    config = {
      ...config,
      user: {
        ...config.user,
        'client-certificate-data': ensureDecoded(config.user['client-certificate-data'])
      }
    }
  }

  if (config.user && config.user['client-key-data']) {
    config = {
      ...config,
      user: {
        ...config.user,
        'client-key-data': ensureDecoded(config.user['client-key-data'])
      }
    }
  }

  const headers = config.user && config.user['auth-provider'] && {
    authorization: `Bearer ${config.user['auth-provider'].config['access-token']}`
  }

  return {
    headers,
    baseUrl: config.cluster.server,
    rejectUnauthorized: false,
    key: config.user && config.user['client-key-data'],
    cert: config.user && config.user['client-certificate-data']
  }
}

module.exports = getKubectlConfig

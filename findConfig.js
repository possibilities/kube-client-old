const { readFile, exists } = require('fs-extra')
const { exec } = require('child-process-promise')

const host = process.env.KUBERNETES_SERVICE_HOST
const port = process.env.KUBERNETES_SERVICE_PORT

const caPath = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt'
const tokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token'

const findConfig = async () => {
  if (await exists(caPath) && await exists(tokenPath)) {
    return {
      baseUrl: `https://${host}:${port}`,
      ca: await readFile(caPath, 'utf8'),
      headers: { authorization: `Bearer ${await readFile(tokenPath, 'utf8')}` }
    }
  }

  const { stdout: configString } = await exec('kubectl config view -ojson --minify')
  const config = JSON.parse(configString)
  const baseUrl = config.clusters.pop().cluster.server
  const { 'current-context': currentContext } = config

  // TODO A bit brute, can probably find these values through ~/.kube/config
  // more naturally
  if (currentContext === 'minikube') {
    return {
      baseUrl,
      cert: await readFile(`${process.env.HOME}/.minikube/apiserver.crt`),
      key: await readFile(`${process.env.HOME}/.minikube/apiserver.key`),
      ca: await readFile(`${process.env.HOME}/.minikube/ca.crt`)
    }
  }

  const { stdout: secretString } = await exec('kubectl get secret -ojson')
  const { items: secrets } = JSON.parse(secretString)
  const defaultSecret = secrets.find(secret => secret.metadata.name.startsWith('default-token-'))

  return {
    baseUrl,
    headers: { authorization: `Bearer ${defaultSecret.data.token}` }
  }
}

module.exports = findConfig

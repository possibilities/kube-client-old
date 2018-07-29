const getInClusterConfig = require('./getInClusterConfig')
const getKubectlConfig = require('./getKubectlConfig')

const findConfig = async () => {
  return await getInClusterConfig() || getKubectlConfig()
}

module.exports = findConfig

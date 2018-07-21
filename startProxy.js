const { spawn } = require('child-process-promise')
const { findAPortNotInUse } = require('portscanner')
const { address: getIp } = require('ip')
const exitHook = require('exit-hook')

const startProxy = async () => {
  const ip = getIp()
  const port = await findAPortNotInUse(1024, 45000, ip)
  const command = `kubectl proxy --port ${port} --accept-hosts .* --address ${ip}`
  const [cmd, ...args] = command.split(' ')
  const proxying = spawn(cmd, args)

  const disconnect = () => {
    proxying.catch(e => {})
    proxying.childProcess.kill()
  }

  exitHook(disconnect)

  return new Promise((resolve, reject) => {
    let output = ''
    proxying.childProcess.stdout.on('data', data => {
      output = `${output}${data.toString()}`
      if (output.includes(`Starting to serve on ${ip}:${port}`)) {
        const config = { baseUrl: `http://${ip}:${port}` }
        resolve({ disconnect, config })
      }
    })
    proxying.catch(error => {
      disconnect()
      reject(error)
    })
  })
}

const maxTries = 1000
const startProxyUntilPortResolves = async () => {
  let index = 0
  let proxy
  while (!proxy) {
    if (index >= maxTries) {
      throw new Error('could not start kubectl proxy')
    }

    try {
      proxy = await startProxy()
    } catch (error) {
      if (!error.message.includes(' failed with code 255')) {
        throw error
      }
    }
    index = index + 1
  }
  return proxy
}

module.exports = startProxyUntilPortResolves

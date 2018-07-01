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

  return new Promise(resolve => {
    let output = ''
    proxying.childProcess.stdout.on('data', data => {
      output = `${output}${data.toString()}`
      if (output.includes(`Starting to serve on ${ip}:${port}`)) {
        const config = { baseUrl: `http://${ip}:${port}` }
        resolve({ disconnect, config })
      }
    })
  })
}

module.exports = startProxy

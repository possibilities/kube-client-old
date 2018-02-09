const exitHook = require('exit-hook')
const { spawn } = require('child-process-promise')
const { findAPortNotInUse } = require('portscanner')
const { address: getIp } = require('ip')

const startProxy = async () => {
  const ip = getIp()
  const port = await findAPortNotInUse(8001, 45000, ip)
  const command = `kubectl proxy --port ${port} --accept-hosts .* --address ${ip}`
  const [cmd, ...args] = command.split(' ')
  const proxying = spawn(cmd, args)
  exitHook(() => proxying.childProcess.kill('SIGHUP'))

  return new Promise(resolve => {
    let output = ''
    proxying.childProcess.stdout.on('data', data => {
      output = `${output}${data.toString()}`
      if (output.includes(`Starting to serve on ${ip}:${port}`)) {
        resolve({
          disconnect: () => {
            proxying.catch(e => {})
            proxying.childProcess.kill('SIGHUP')
          },
          config: { baseUrl: `http://${ip}:${port}` }
        })
      }
    })
  })
}

module.exports = startProxy

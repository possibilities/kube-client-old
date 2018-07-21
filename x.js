const startProxy = require('./startProxy')

const run = async () => {
  const [proxy1, proxy2] = await Promise.all([
    startProxy(),
    startProxy()
  ])
  console.log(proxy1.config)
  console.log(proxy2.config)
  proxy1.disconnect()
  proxy2.disconnect()
}

run()

const last = require('lodash/last')
const { spy } = require('sinon')
const test = require('ava')
const { kubernetesApi, throwUnlessConflict } = require('.')
const exitHook = require('exit-hook')
const { spawn } = require('child-process-promise')
const { findAPortNotInUse } = require('portscanner')
const { address: getIp } = require('ip')

let proxy
let kubernetes
let kubernetesWithAliases
let kubernetesWithCustomResources

const customResources = [{
  metadata: {
    name: 'foobars.foobar.com'
  },
  spec: {
    group: 'foobar.com',
    version: 'v1',
    scope: 'Namespaced',
    names: {
      plural: 'foobars',
      singular: 'foobar',
      kind: 'FooBar'
    }
  }
}]

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
          proxying,
          config: {
            baseURL: `http://${ip}:${port}`
          }
        })
      }
    })
  })
}

test.beforeEach(async t => {
  const namespace = 'test-foobar'
  proxy = await startProxy()

  kubernetes = await kubernetesApi({ namespace, ...proxy.config })

  kubernetesWithCustomResources = await kubernetesApi({
    namespace,
    customResources,
    ...proxy.config
  })

  kubernetesWithAliases = await kubernetesApi({
    namespace,
    aliases: { mapz: 'api.v1.configmaps' },
    ...proxy.config
  })

  await kubernetes.api.v1.namespaces
    .create({ metadata: { name: namespace } })
    .catch(throwUnlessConflict)

  await kubernetes.api.v1.configmaps.deletecollection()
  await new Promise(resolve => setTimeout(resolve, 1000))
})

test.afterEach(async t => {
  await kubernetes.api.v1.configmaps.deletecollection()
  await new Promise(resolve => setTimeout(resolve, 1000))
  proxy.proxying.catch(e => e).childProcess.kill('SIGHUP')
})

test('gets', async t => {
  const name = `test-config-${Date.now()}`

  await kubernetes.api.v1.configmaps.create({
    metadata: { name },
    data: { foo: 'bar' }
  })

  const testMap = await kubernetes.api.v1.configmaps.get(name)
  t.is(testMap.data.foo, 'bar')
})

test('lists', async t => {
  await kubernetes.api.v1.configmaps.create({
    metadata: { name: `test-config-1-${Date.now()}` },
    data: { foo: 'bar1' }
  })

  await kubernetes.api.v1.configmaps.create({
    metadata: { name: `test-config-2-${Date.now()}` },
    data: { foo: 'bar2' }
  })

  const { items: [testMap1, testMap2] } =
    await kubernetes.api.v1.configmaps.list()

  t.is(testMap1.data.foo, 'bar1')
  t.is(testMap2.data.foo, 'bar2')
})

test('lists with query', async t => {
  await kubernetes.api.v1.configmaps.create({
    metadata: {
      name: `test-config-1-${Date.now()}`,
      labels: { foo: 'cool' }
    },
    data: { foo: 'bar1' }
  })

  await kubernetes.api.v1.configmaps.create({
    metadata: {
      name: `test-config-2-${Date.now()}`,
      labels: { foo: 'uncool' }
    },
    data: { foo: 'bar2' }
  })

  await kubernetes.api.v1.configmaps.create({
    metadata: {
      name: `test-config-3-${Date.now()}`,
      labels: { foo: 'cool' }
    },
    data: { foo: 'bar3' }
  })

  const { items } = await kubernetes.api.v1.configmaps.list()
  t.is(items.length, 3)

  const { items: itemsWithQuery } = await kubernetes.api.v1.configmaps.list({
    labelSelector: 'foo=cool'
  })
  t.is(itemsWithQuery.length, 2)
})

test('deletes', async t => {
  const name = `test-config-${Date.now()}`

  await kubernetes.api.v1.configmaps.create({
    metadata: { name },
    data: { foo: 'bar' }
  })

  const { items: itemsBefore } = await kubernetes.api.v1.configmaps.list()
  t.is(itemsBefore.length, 1)

  await kubernetes.api.v1.configmaps.delete(name)

  const { items: itemsAfter } = await kubernetes.api.v1.configmaps.list()
  t.is(itemsAfter.length, 0)
})

test('deletes collection', async t => {
  await kubernetes.api.v1.configmaps.create({
    metadata: { name: `test-config-1-${Date.now()}` },
    data: { foo: 'bar1' }
  })

  await kubernetes.api.v1.configmaps.create({
    metadata: { name: `test-config-2-${Date.now()}` },
    data: { foo: 'bar2' }
  })

  const { items: itemsBefore } = await kubernetes.api.v1.configmaps.list()
  t.is(itemsBefore.length, 2)

  await kubernetes.api.v1.configmaps.deletecollection()

  const { items: itemsAfter } = await kubernetes.api.v1.configmaps.list()
  t.is(itemsAfter.length, 0)
})

test('deletes collection with query', async t => {
  await kubernetes.api.v1.configmaps.create({
    metadata: {
      name: `test-config-1-${Date.now()}`,
      labels: { foo: 'cool' }
    },
    data: { foo: 'bar1' }
  })

  await kubernetes.api.v1.configmaps.create({
    metadata: {
      name: `test-config-2-${Date.now()}`,
      labels: { foo: 'uncool' }
    },
    data: { foo: 'bar2' }
  })

  await kubernetes.api.v1.configmaps.create({
    metadata: {
      name: `test-config-3-${Date.now()}`,
      labels: { foo: 'cool' }
    },
    data: { foo: 'bar3' }
  })

  const { items: itemsBefore } = await kubernetes.api.v1.configmaps.list()
  t.is(itemsBefore.length, 3)

  await kubernetes.api.v1.configmaps.deletecollection({
    labelSelector: 'foo=cool'
  })

  const { items: itemsAfter } = await kubernetes.api.v1.configmaps.list()
  t.is(itemsAfter.length, 1)
})

test('creates', async t => {
  const name = `test-config-${Date.now()}`

  await kubernetes.api.v1.configmaps.create({
    metadata: { name },
    data: { foo: 'bar' }
  })

  const testMap = await kubernetes.api.v1.configmaps.get(name)
  t.is(testMap.data.foo, 'bar')
})

test('updates', async t => {
  const name = `test-config-${Date.now()}`

  const testMap = await kubernetes.api.v1.configmaps.create({
    metadata: { name },
    data: { foo: 'bar' }
  })

  const testMapRefetched = await kubernetes.api.v1.configmaps
    .get(testMap.metadata.name)

  t.is(testMapRefetched.data.foo, 'bar')

  await kubernetes.api.v1.configmaps.update(name, {
    metadata: { name },
    data: { foo: 'bar2' }
  })

  const testMapRefetchedAgain =
    await kubernetes.api.v1.configmaps.get(testMap.metadata.name)
  t.is(testMapRefetchedAgain.data.foo, 'bar2')
})

test('patches', async t => {
  const name = `test-config-${Date.now()}`

  const testMap = await kubernetes.api.v1.configmaps.create({
    metadata: { name },
    data: { foo: 'bar' }
  })

  const testMapRefetched = await kubernetes.api.v1.configmaps
    .get(testMap.metadata.name)

  t.is(testMapRefetched.data.foo, 'bar')
  t.is(testMapRefetched.data.baz, undefined)

  await kubernetes.api.v1.configmaps.patch(name, {
    data: { baz: 'buzz' }
  })

  const testMapRefetchedAgain = await kubernetes.api.v1.configmaps
    .get(testMap.metadata.name)

  t.is(testMapRefetchedAgain.data.foo, 'bar')
  t.is(testMapRefetchedAgain.data.baz, 'buzz')
})

test.cb('watches the items in collection', t => {
  kubernetes.api.v1.configmaps.watch({ timeoutSeconds: 1 })
    .then(configmaps => {
      const addedSpy = spy()
      configmaps.on('added', addedSpy)
      configmaps.on('reconnect', async () => {
        t.is(addedSpy.callCount, 2)
        t.is(last(addedSpy.firstCall.args).data.foo, 'fuzzy1')
        t.is(last(addedSpy.secondCall.args).data.foo, 'fuzzy2')
        configmaps.disconnect()
        t.end()
      })

      const name1 = `test-config-${Date.now()}`
      return kubernetes.api.v1.configmaps.create({
        metadata: { name: name1 },
        data: { foo: 'fuzzy1' }
      }).then(() => {
        const name2 = `test-config-2-${Date.now()}`
        kubernetes.api.v1.configmaps.create({
          metadata: { name: name2 },
          data: { foo: 'fuzzy2' }
        })
      })
    })
})

test.cb('watches a single item', t => {
  const name1 = `test-config-1-${Date.now()}`
  kubernetes.api.v1.configmaps.create({
    metadata: { name: name1 },
    data: { foo: 'fuzzy1' }
  }).then(() => {
    kubernetes.api.v1.configmaps.watch(name1, { timeoutSeconds: 5 })
      .then(configmaps => {
        const modifiedSpy = spy()
        const deletedSpy = spy()
        configmaps.on('modified', modifiedSpy)
        configmaps.on('deleted', deletedSpy)
        configmaps.on('reconnect', async () => {
          t.is(modifiedSpy.callCount, 1)
          t.is(deletedSpy.callCount, 1)
          configmaps.disconnect()
          t.end()
        })
        kubernetes.api.v1.configmaps.update(name1, {
          metadata: { name: name1 },
          data: { foo: 'fuzzy1', bar: 'dirty1' }
        }).then(() => {
          kubernetes.api.v1.configmaps.delete(name1)
        })
      })
  })
})

test('loads custom resources', async t => {
  const name = `test-custom-${Date.now()}`
  const { foobars } = kubernetesWithCustomResources.apis.foobar.com.v1

  await foobars.create({
    apiVersion: 'foobar.com/v1',
    kind: 'FooBar',
    metadata: { name },
    data: { foo: 'bar' }
  })

  const foo = await foobars.get(name)
  t.is(foo.data.foo, 'bar')
})

test('exposes aliases', async t => {
  const name = `test-config-${Date.now()}`

  await kubernetesWithAliases.mapz.create({
    metadata: { name },
    data: { foo: 'bar' }
  })

  const testMap = await kubernetesWithAliases.mapz.get(name)
  t.is(testMap.data.foo, 'bar')
})

test('exposes raw interface', async t => {
  const name = `test-config-${Date.now()}`

  await kubernetes(
    '/api/v1/namespaces/test-foobar/configmaps'
  ).create({
    metadata: { name },
    data: { foo: 'bar' }
  })

  const testMap = await kubernetes(
    '/api/v1/namespaces/test-foobar/configmaps'
  ).get(name)
  t.is(testMap.data.foo, 'bar')
})

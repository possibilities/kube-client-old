const last = require('lodash/last')
const { spy } = require('sinon')
const test = require('ava')
const kubernetesClient = require('.')
const startProxy = require('./startProxy')

let proxy
let kubernetes

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

test.beforeEach(async t => {
  const namespace = 'test-foobar'
  proxy = await startProxy()

  kubernetes = await kubernetesClient({
    namespace,
    customResources,
    ensureNamespace: true,
    aliases: { mapz: 'api.v1.configmaps' },
    ...proxy.config
  })

  await kubernetes.api.v1.configmaps.deletecollection()
  await new Promise(resolve => setTimeout(resolve, 1000))
})

test.afterEach(async t => {
  await kubernetes.api.v1.configmaps.deletecollection()
  await new Promise(resolve => setTimeout(resolve, 1000))
  proxy.disconnect()
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

test('upserts', async t => {
  const name = `test-config-${Date.now()}`

  const testMap = await kubernetes.api.v1.configmaps.upsert(name, {
    metadata: { name },
    data: { foo: 'bar' }
  })

  const testMapRefetched = await kubernetes.api.v1.configmaps
    .get(testMap.metadata.name)

  t.is(testMapRefetched.data.foo, 'bar')

  await kubernetes.api.v1.configmaps.upsert(name, {
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

test.cb('watches collection', t => {
  kubernetes.api.v1.configmaps.watch({ timeoutSeconds: 1 })
    .then(configmaps => {
      const addedSpy = spy()
      const deletedSpy = spy()
      const modifiedSpy = spy()
      configmaps.on('added', addedSpy)
      configmaps.on('deleted', deletedSpy)
      configmaps.on('modified', modifiedSpy)
      configmaps.on('reconnect', () => {
        t.is(addedSpy.callCount, 2)
        t.is(deletedSpy.callCount, 1)
        t.is(modifiedSpy.callCount, 1)
        t.is(last(addedSpy.firstCall.args).data.foo, 'fuzzy1')
        t.is(last(addedSpy.secondCall.args).data.foo, 'fuzzy2')
        t.is(last(deletedSpy.firstCall.args).data.foo, 'fuzzy1')
        t.is(last(modifiedSpy.firstCall.args).data.bar, 'dirty1')
        configmaps.unwatch()
        t.end()
      })

      const name1 = `test-config-${Date.now()}`

      kubernetes.api.v1.configmaps.create({
        metadata: { name: name1 },
        data: { foo: 'fuzzy1' }
      }).then(() => {
        const name2 = `test-config-2-${Date.now()}`
        kubernetes.api.v1.configmaps.create({
          metadata: { name: name2 },
          data: { foo: 'fuzzy2' }
        }).then(() => {
          kubernetes.api.v1.configmaps.update(name1, {
            metadata: { name: name1 },
            data: { foo: 'fuzzy1', bar: 'dirty1' }
          }).then(() => {
            kubernetes.api.v1.configmaps.delete(name1)
          })
        })
      })
    })
})

test.cb('watches entity', t => {
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
        configmaps.on('reconnect', () => {
          t.is(modifiedSpy.callCount, 1)
          t.is(deletedSpy.callCount, 1)
          t.is(last(modifiedSpy.firstCall.args).data.bar, 'dirty1')
          t.is(last(deletedSpy.firstCall.args).data.foo, 'fuzzy1')
          configmaps.unwatch()
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
  const { foobars } = kubernetes.apis.foobar.com.v1

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

  await kubernetes.mapz.create({
    metadata: { name },
    data: { foo: 'bar' }
  })

  const testMap = await kubernetes.mapz.get(name)
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

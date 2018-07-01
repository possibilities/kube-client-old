# Kubernetes API client [![CircleCI](https://img.shields.io/circleci/project/github/possibilities/kube-client.svg)](https://circleci.com/gh/possibilities/kube-client) [![npm](https://img.shields.io/npm/v/kube-client.svg)](https://www.npmjs.com/package/kube-client)

A Kubernetes API client for nodejs

## Features

* Simple promise-based interface
* Builds interface dynamically by inspecting connected Kubernetes API resources

## Install

```shell
yarn add kube-client
```

## Configure

```js
const kubernetesClient = require('kube-client')
const kubernetes = await kubernetesClient({ baseUrl: 'http://127.0.0.1:8001' })
```

## Usage

#### `get(name)`

```js
const config = await kubernetes.api.v1.configmaps.get('test-config-1')
```

#### `list(query = {})`

```js
await kubernetes.api.v1.configmaps.list()
await kubernetes.api.v1.configmaps.list(
  labelSelector: 'foo=bar'
})
```

#### `create(data = {}, query = {})`

```js
await kubernetes.api.v1.configmaps.create({
  metadata: { name: 'test-config-1', labels: { foo: 'bar' } },
  data: { foo: 'bar1' }
})
```

#### `update(name, data = {}, query = {})`

```js
await kubernetes.api.v1.configmaps.update({
  metadata: { name: 'test-config-2', labels: { foo: 'bar' } },
  data: { foo: 'bar2' }
})
```

#### `upsert(name, data = {}, query = {})`

```js
await kubernetes.api.v1.configmaps.upsert({
  metadata: { name: 'test-config-2', labels: { foo: 'bar' } },
  data: { foo: 'bar2' }
})
await kubernetes.api.v1.configmaps.upsert({
  metadata: { name: 'test-config-2', labels: { foo: 'bar' } },
  data: { foo: 'bar3' }
})
```

#### `patch(name, data = {}, query = {})`

```js
await kubernetes.api.v1.configmaps.patch('test-config-2', {
  data: { baz: 'buzz' }
})
```

#### `delete(name, query = {})`

```js
await kubernetes.api.v1.configmaps.delete('test-config-2')
```

#### `deletecollection(query = {})`

```js
await kubernetes.api.v1.configmaps.deletecollection()
await kubernetes.api.v1.configmaps.deletecollection({
  labelSelector: 'foo=bar'
})
```

#### `watch(name, query = {})`

Watch a single item

```js
const configmaps = await kubernetes.api.v1.configmaps.watch('test-config-2')
configmaps.on('added', configmap => console.info('added', configmap))
configmaps.on('modified', configmap => console.info('modified', configmap))
configmaps.on('deleted', configmap => console.info('deleted', configmap))
configmaps.unwatch()
```

#### `watch(query = {})`

Watch a collection

```js
const configmaps = await kubernetes.api.v1.configmaps.watch('test-config-2')
configmaps.on('added', configmap => console.info('added', configmap))
configmaps.on('modified', configmap => console.info('modified', configmap))
configmaps.on('deleted', configmap => console.info('deleted', configmap))
configmaps.unwatch()
```

### Configuration

#### `customResources`

Configure client to register and utilize custom resources

```js
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

const kubernetes = await kubernetesClient({
  customResources,
  baseUrl: 'http://127.0.0.1:8001'
})

await apis.foobar.com.v1.foobars.create({
  apiVersion: 'foobar.com/v1',
  kind: 'FooBar',
  metadata: { name },
  data: { foo: 'bar' }
})
```

#### `ensureNamespace`

Create the requested namespace if it doesn't exist

```js
const kubernetes = await kubernetesClient({
  namespace: 'foofbar',
  ensureNamespace: true,
  baseUrl: 'http://127.0.0.1:8001'
})

```
#### `aliases`

Configure client to expose useful aliases to resources

```js
const kubernetes = await kubernetesClient({
  baseUrl: 'http://127.0.0.1:8001',
  aliases: { configmaps: 'api.v1.configmaps' }
})

await kubernetes.configmaps.create({
  metadata: { name: 'test-config-3', labels: { foo: 'bar' } },
  data: { foo: 'bar1' }
})
```

### Helpers

#### `startProxy`

Start a `kubectl` proxy on a random port

```js
const startProxy = require('kube-client/startProxy')
const proxy = await startProxy()
const kubernetes = await kubernetesClient(proxy.config)
proxy.disconnect()
```

#### `findConfig`/`findConfigSync`

Find configuration to access Kubernetes API from inside a container

```js
const findConfig = require('kube-client/findConfig')
const config = await findConfig()
const kubernetes = await kubernetesClient(config)
```

```js
const findConfigSync = require('kube-client/findConfigSync')
const config = findConfigSync()
const kubernetes = await kubernetesClient(config)
```

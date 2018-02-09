# Kubernetes API client

A Kubernetes API client for nodejs

## Features

* Simple promise-based interface
* Builds interface dynamically by inspecting connected Kubernetes API resources

## Install

```shell
yarn install kube-client
```

## Usage

### Configure

```js
const kubernetes = require('kube-client')
const kubernetes = await kubernetesApi({ baseUrl: 'http://127.0.0.1:8001' })
```

### Verbs

#### Create

```js
await kubernetes.api.v1.configmaps.create({
  metadata: { name: 'test-config-1', labels: { foo: 'bar' } },
  data: { foo: 'bar1' }
})
```

#### Read

```js
const config = await kubernetes.api.v1.configmaps.get('test-config-1')
```

#### Update

```js
await kubernetes.api.v1.configmaps.update({
  metadata: { name: 'test-config-2', labels: { foo: 'bar' } },
  data: { foo: 'bar2' }
})
```

#### Patch

```js
await kubernetes.api.v1.configmaps.patch('test-config-2', {
  data: { baz: 'buzz' }
})
```

#### List

```js
await kubernetes.api.v1.configmaps.list()
await kubernetes.api.v1.configmaps.list(
  labelSelector: 'foo=bar'
})
```

#### Delete

##### Item

```js
await kubernetes.api.v1.configmaps.delete('test-config-2')
```

##### Collection

```js
await kubernetes.api.v1.configmaps.deletecollection()
await kubernetes.api.v1.configmaps.deletecollection({
  labelSelector: 'foo=bar'
})
```

#### Watch

##### Item

```js
const configmaps = await kubernetes.api.v1.configmaps.watch('test-config-2')
configmaps.on('added', configmap => console.info('added', configmap))
configmaps.on('modified', configmap => console.info('modified', configmap))
configmaps.on('deleted', configmap => console.info('deleted', configmap))
configmaps.unwatch()
```

##### Collection

```js
const configmaps = await kubernetes.api.v1.configmaps.watch('test-config-2')
configmaps.on('added', configmap => console.info('added', configmap))
configmaps.on('modified', configmap => console.info('modified', configmap))
configmaps.on('deleted', configmap => console.info('deleted', configmap))
configmaps.unwatch()
```

### Options

#### Custom resources

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

const kubernetes = await kubernetesApi({
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

#### Aliases

Configure client to expose useful aliases to resources

```js
const kubernetes = await kubernetesApi({
  baseUrl: 'http://127.0.0.1:8001',
  aliases: { configmaps: 'api.v1.configmaps' }
})

await kubernetes.configmaps.create({
  metadata: { name: 'test-config-3', labels: { foo: 'bar' } },
  data: { foo: 'bar1' }
})
```

## Helpers

### `startProxy`

Start a `kubectl` proxy on a random port

```js
const proxy = await startProxy()
const kubernetes = await kubernetesApi(proxy.config)
```

### `findConfig`/`findConfigSync`

Find configuration to access Kubernetes API from inside a container

```
const config = await findConfig()
const kubernetes = await kubernetesApi(config)
```

```
const config = findConfigSync()
const kubernetes = await kubernetesApi(config)
```

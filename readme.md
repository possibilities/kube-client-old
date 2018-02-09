# Kubernetes API client

## Usage

Install

```shell
yarn install kube-client
```

Configure

```js
const kubernetes = require('kube-client')
const kubernetes = await kubernetesApi({ baseUrl: 'http://127.0.0.1:8001' })
```

Create

```js
await kubernetes.api.v1.configmaps.create({
  metadata: { name: 'test-config-1', labels: { foo: 'bar' } },
  data: { foo: 'bar1' }
})
```

Read

```js
const config = await kubernetes.api.v1.configmaps.get('test-config-1')
```

Update

```js
await kubernetes.api.v1.configmaps.update({
  metadata: { name: 'test-config-2', labels: { foo: 'bar' } },
  data: { foo: 'bar2' }
})
```

Patch

```js
await kubernetes.api.v1.configmaps.patch('test-config-2', {
  data: { baz: 'buzz' }
})
```

List

```js
await kubernetes.api.v1.configmaps.list()
await kubernetes.api.v1.configmaps.list(
  labelSelector: 'foo=bar'
})
```

Delete

```js
await kubernetes.api.v1.configmaps.delete('test-config-2')
```

Delete collection

```js
await kubernetes.api.v1.configmaps.deletecollection()
await kubernetes.api.v1.configmaps.deletecollection({
  labelSelector: 'foo=bar'
})
```

Watching

```js
const configmaps = await kubernetes.api.v1.configmaps.watch('test-config-2')
configmaps.on('added', configmap => console.info('added', configmap))
configmaps.on('modified', configmap => console.info('modified', configmap))
configmaps.on('deleted', configmap => console.info('deleted', configmap))
configmaps.unwatch()
```

Watching a list

```js
const configmaps = await kubernetes.api.v1.configmaps.watch('test-config-2')
configmaps.on('added', configmap => console.info('added', configmap))
configmaps.on('modified', configmap => console.info('modified', configmap))
configmaps.on('deleted', configmap => console.info('deleted', configmap))
configmaps.unwatch()
```

Configuring custom resource definitions

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

Configure resource aliases

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

```
const proxy = await startProxy()
const kubernetes = await kubernetesApi(proxy.config)
await kubernetes.api.v1.configmaps.get(name)
proxy.disconnect()
```

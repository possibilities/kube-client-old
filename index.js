const { EventEmitter } = require('events')
const requestWithCallback = require('request')
const extend = require('lodash/extend')
const isString = require('lodash/isString')
const get = require('lodash/get')
const set = require('lodash/set')
const mapValues = require('lodash/mapValues')
const fromPairs = require('lodash/fromPairs')
const isObject = require('lodash/isObject')
const { promisify } = require('util')
const reconnectCore = require('reconnect-core')
const configureDebug = require('debug')
const JSONStream = require('JSONStream')
const eventStream = require('event-stream')

const debug = configureDebug('kapi:client')

const oneDaySeconds = 60 * 60 * 24
const timeoutSeconds = oneDaySeconds

const request = (...args) => {
  const req = promisify(
    requestWithCallback
    .defaults({ json: true }))
  return req(...args).then(({ body }) => body)
}

const throwUnlessConflict = error => {
  const code = get(error, 'response.data.code')
  if (code !== 409) throw error
}

const configureResourceClient = (globalConfig = {}) => {
  debug('configuring resource client with config %O', globalConfig)
  const resourceClient = (apiPath = '/', resourceConfig = {}) => {
    debug('invoking resource client %s %O', apiPath, resourceConfig)

    const { baseURL, ...combinedConfig } =
      { ...globalConfig, ...resourceConfig }

    const cleanApiPath = apiPath.replace(/^\//, '')
    const path = `${baseURL}/${cleanApiPath}`
    const buildQuery = qs => ({ ...combinedConfig.qs, ...qs })

    return {
      get: (name, qs) => {
        const payload = {
          url: `${path}/${name}`,
          method: 'get',
          qs: buildQuery(qs)
        }
        debug('invoking resource `get` %O', payload)
        return request(payload)
      },

      list: qs => {
        const payload = {
          url: path,
          method: 'get',
          qs: buildQuery(qs)
        }
        debug('invoking resource `list` %O', payload)
        return request(payload)
      },

      delete: (name, qs) => {
        const payload = {
          url: `${path}/${name}`,
          method: 'delete',
          qs: buildQuery(qs)
        }
        debug('invoking resource `delete` %O', payload)
        return request(payload)
      },

      deletecollection: qs => {
        const payload = {
          url: path,
          method: 'delete',
          qs: buildQuery(qs)
        }
        debug('invoking resource `deletecollection` %O', payload)
        return request(payload)
      },

      create: (body, qs) => {
        const payload = {
          body,
          url: path,
          method: 'post',
          qs: buildQuery(qs)
        }
        debug('invoking resource `create` %O', payload)
        return request(payload)
      },

      update: (name, body, qs) => {
        const payload = {
          body,
          url: `${path}/${name}`,
          method: 'put',
          qs: buildQuery(qs)
        }
        debug('invoking resource `update` %O', payload)
        return request(payload)
      },

      patch: (name, body, qs) => {
        const payload = {
          ...combinedConfig,
          body,
          url: `${path}/${name}`,
          method: 'patch',
          headers: { 'content-type': 'application/merge-patch+json' },
          qs: buildQuery(qs)
        }
        debug('invoking resource `patch` %O', payload)
        return request(payload)
      },

      watch: async (...args) => {
        const url = isString(args[0]) ? `${path}/${args[0]}` : path
        const qs = buildQuery(args.filter(isObject).pop() || {})
        const vent = new EventEmitter()
        let resourceVersion = qs.resourceVersion || 0

        const reconnect = reconnectCore(config => requestWithCallback({
          ...combinedConfig,
          url,
          method: 'get',
          qs: { ...config.qs, ...qs, resourceVersion }
        }))

        const reconnector = reconnect({}, reconnectingStream => {
          debug('reconnecting to `%s`', url)
          reconnectingStream.pipe(JSONStream.parse())
            .pipe(eventStream.mapSync(data => {
              if (data.type !== 'ERROR') {
                debug('emitting `%s` event for `%s`', data.type, data.object.metadata.name)
                vent.emit(data.type.toLowerCase(), data.object)
              }

              resourceVersion = data.type === 'ERROR' || data.type === 'DELETED'
                ? 0
                : data.object.metadata.resourceVersion
              debug('caching `resourceVersion` %s', resourceVersion)
            }))
          return reconnectingStream
        })

        reconnector.connect({
          ...combinedConfig,
          url,
          method: 'get',
          qs: { timeoutSeconds, ...qs }
        })

        reconnector.on('reconnect', () => vent.emit('reconnect'))

        vent.disconnect = () => {
          vent.removeAllListeners()
          reconnector.disconnect()
        }

        return vent
      }
    }
  }

  return resourceClient
}

const kubernetesApi = async (config = {}) => {
  const {
    namespace = null,
    aliases = {},
    customResources = [],
    ...requestConfig
  } = config

  // Prepare resource client with initial configuration
  const resourceClient = configureResourceClient(requestConfig)

  // Load custom resources
  await Promise.all(customResources.map(resource => {
    return resourceClient(
      `/apis/apiextensions.k8s.io/v1beta1/customresourcedefinitions`
    )
      .create(resource)
      .catch(throwUnlessConflict)
  }))

  // Fetch some meta infos from API
  const { paths } = await resourceClient().list()
  const version = await resourceClient(`/version`).list()

  // Collect metadata from API
  // TODO probably a better way to do this
  const responses = await Promise.all(paths.map(async path => {
    try {
      const data = await resourceClient(path).list()
      if (isObject(data)) {
        return { data, path: path.replace(/^\//, '') }
      }
    } catch (error) {}
    return null
  }))

  let api = { version }

  responses
    .filter(resource => get(resource, 'data.kind') === 'APIResourceList')
    .forEach(resourceList => {
      const resources = resourceList.data.resources.reduce((resources, resource) => ({
        ...resources,
        [resource.name]: fromPairs(
          resource.verbs.map(verb => ([
            verb,
            (...args) => {
              let path = [resourceList.path]

              if (verb === 'watch') {
                path = [...path, 'watch']
              }

              if (namespace && resource.namespaced) {
                path = [...path, 'namespaces', namespace]
              }

              const url = [...path, resource.name].join('/')

              return resourceClient(url)[verb](...args)
            }
          ]))
        )
      }), {})

      const apiPath = resourceList.path.replace(/\//g, '.')
      api = set(api, apiPath, resources)
    })

  const resourceAliases = mapValues(aliases, path => {
    const apiPath = path.replace(/^\//, '').replace(/\//g, '.')
    return get(api, apiPath)
  })

  return extend(resourceClient, api, resourceAliases)
}

module.exports.kubernetesApi = kubernetesApi
module.exports.throwUnlessConflict = throwUnlessConflict

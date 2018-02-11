const { EventEmitter } = require('events')
const requestWithCallback = require('request')
const extend = require('lodash/extend')
const startsWith = require('lodash/startsWith')
const isString = require('lodash/isString')
const get = require('lodash/get')
const set = require('lodash/set')
const mapValues = require('lodash/mapValues')
const isObject = require('lodash/isObject')
const { promisify } = require('util')
const reconnectCore = require('reconnect-core')
const configureDebug = require('debug')
const JSONStream = require('JSONStream')
const eventStream = require('event-stream')
const omit = require('lodash/omit')

const debug = configureDebug('kube-client')

const oneDaySeconds = 60 * 60 * 24
const timeoutSeconds = oneDaySeconds

const requestWithPromise =
  promisify(requestWithCallback.defaults({ json: true }))

const request = (...args) =>
  new Promise((resolve, reject) => {
    requestWithPromise(...args).then(({ body }) => {
      if (body.code && body.code >= 400) {
        reject(body)
      }
      resolve(body)
    })
  })

const throwUnlessConflict = error => {
  if (error.code !== 409) throw error
}

// The client is split into two peices. The first is a resource client
// that points to a single resource type, given any arbitrary api server
// pathname, and can be used to invoke any available verb for that resource.
// While it can be used directly it's more practical to invoke a provided
// helper (see module export).
const configureResourceClient = (globalConfig = {}) => {
  debug('configuring resource client with config %O', globalConfig)
  const resourceClient = (apiPath = '/', resourceConfig = {}) => {
    debug('invoking resource client %s %O', apiPath, resourceConfig)
    const combinedConfig = { ...globalConfig, ...resourceConfig }
    const path = startsWith(apiPath, '/') ? apiPath : `/${apiPath}`
    const baseQuery = combinedConfig.qs || {}

    const api = {
      get: (name, qs = {}) => {
        const payload = {
          ...combinedConfig,
          url: `${path}/${name}`,
          method: 'get',
          qs: { ...baseQuery, ...qs }
        }
        debug('invoking resource `get` %O', payload)
        return request(payload)
      },

      list: (qs = {}) => {
        const payload = {
          ...combinedConfig,
          url: path,
          method: 'get',
          qs: { ...baseQuery, ...qs }
        }
        debug('invoking resource `list` %O', payload)
        return request(payload)
      },

      delete: (name, qs = {}) => {
        const payload = {
          ...combinedConfig,
          url: `${path}/${name}`,
          method: 'delete',
          qs: { ...baseQuery, ...qs }
        }
        debug('invoking resource `delete` %O', payload)
        return request(payload)
      },

      deletecollection: (qs = {}) => {
        const payload = {
          ...combinedConfig,
          url: path,
          method: 'delete',
          qs: { ...baseQuery, ...qs }
        }
        debug('invoking resource `deletecollection` %O', payload)
        return request(payload)
      },

      create: (body, qs = {}) => {
        const payload = {
          ...combinedConfig,
          body,
          url: path,
          method: 'post',
          qs: { ...baseQuery, ...qs }
        }
        debug('invoking resource `create` %O', payload)
        return request(payload)
      },

      update: (name, body, qs = {}) => {
        const payload = {
          ...combinedConfig,
          body,
          url: `${path}/${name}`,
          method: 'put',
          qs: { ...baseQuery, ...qs }
        }
        debug('invoking resource `update` %O', payload)
        return request(payload)
      },

      upsert: async (...args) => {
        const [name, ...upsertArgs] = args
        try {
          return await api.create(...upsertArgs)
        } catch (error) {
          if (error.code === 409) {
            return api.update(name, ...upsertArgs)
          }
          throw error
        }
      },

      patch: (name, body, qs = {}) => {
        const payload = {
          ...combinedConfig,
          body,
          url: `${path}/${name}`,
          method: 'patch',
          headers: { 'content-type': 'application/merge-patch+json' },
          qs: { ...baseQuery, ...qs }
        }
        debug('invoking resource `patch` %O', payload)
        return request(payload)
      },

      watch: async (...args) => {
        const url = isString(args[0]) ? `${path}/${args[0]}` : path
        const watchQuery = args.filter(isObject).pop() || {}
        const qs = { timeoutSeconds, ...baseQuery, ...watchQuery }
        const vent = new EventEmitter()
        let resourceVersion = qs.resourceVersion || 0

        const reconnect = reconnectCore(requestConfig => requestWithCallback({
          ...requestConfig,
          qs: { ...requestConfig.qs, resourceVersion }
        }))

        const reconnector = reconnect({}, reconnectingStream => {
          debug('reconnecting to `%s`', url)
          reconnectingStream.pipe(JSONStream.parse())
            .pipe(eventStream.mapSync(data => {
              if (data.type !== 'ERROR') {
                debug(
                  'emitting `%s` event for `%s`',
                  data.type,
                  data.object.metadata.name
                )
                vent.emit(data.type.toLowerCase(), data.object)
              }

              resourceVersion = get(data, 'object.metadata.resourceVersion', 0)
              debug('caching `resourceVersion` %s', resourceVersion)
            }))
          return reconnectingStream
        })

        reconnector.connect({ ...combinedConfig, url, method: 'get', qs })
        reconnector.on('reconnect', () => vent.emit('reconnect'))

        vent.unwatch = () => {
          vent.removeAllListeners()
          reconnector.disconnect()
        }

        return vent
      }
    }

    return api
  }

  return resourceClient
}

// This is the second part of the API client. It provides a nice interface
// over all available resources of the api by returning an object with
// preconfigured helpers for each available resource on the connected
// kubernetes api.
const kubernetesClient = async (config = {}) => {
  const {
    namespace = null,
    aliases = {},
    customResources = [],
    ensureNamespace: shouldEnsureNamespace,
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

  // Fetch meta infos from API
  const { paths } = await resourceClient().list()

  // Collect metadata from API
  const topLevelApiResources = await Promise.all(
    paths
      .filter(path => startsWith(path, '/api'))
      .map(async path => {
        const data = await resourceClient(path).list()
        return { ...data, path }
      }
  ))

  // Here's a pipe line where we take in the output of the metadata served
  // by the kubernetes api server. The output is the library's interface
  // "shaped" dynamically based on the api "schema" described by the
  // kubernetes api server
  const apiResources = topLevelApiResources
    .filter(resource => resource.kind === 'APIResourceList')
    // Reduce down to resources with resource api paths included
    .reduce((resources, apiResourceList) => {
      apiResourceList.resources.forEach(resource => {
        resources = [
          ...resources,
          { ...resource, group: apiResourceList.path }
        ]
      })
      return resources
    }, [])
    // Reduce down to verbs with resource metadata included
    .reduce((paths, resource) => {
      const verbs = resource.verbs.includes('update')
        ? [...resource.verbs, 'upsert']
        : resource.verbs

      verbs.forEach(verb => {
        paths = [
          ...paths,
          { verb, ...omit(resource, 'verbs', 'singularName') }
        ]
      })
      return paths
    }, [])
    // Collect full path to each resource verb and corresponding
    // helper function
    .map(resourceVerb => {
      // A dotted path used by lodash `set`, e.g. `api.v1.pods.list`
      const path = [
        resourceVerb.group.slice(1), // Trim prefixed slash
        resourceVerb.name,
        resourceVerb.verb
      ].join('.')
      return {
        path,
        helper: (...args) => {
          let urlSegments = [resourceVerb.group]

          if (resourceVerb.verb === 'watch') {
            urlSegments = [...urlSegments, 'watch']
          }

          if (namespace && resourceVerb.namespaced) {
            urlSegments = [...urlSegments, 'namespaces', namespace]
          }

          const url = [...urlSegments, resourceVerb.name].join('/')

          return resourceClient(url)[resourceVerb.verb](...args)
        }
      }
    })
    // Finally set each helper on at the appropriate key of a "api resource"
    // object forming the API for the library
    .reduce((resources, { path, helper }) => {
      set(resources, path.replace(/\//g, '.'), helper)
      return resources
    }, {})

  // Configure user defined aliases to resources
  const resourceAliases = mapValues(aliases, path => {
    const apiPath = path.replace(/\//g, '.')
    return get(apiResources, apiPath)
  })

  if (shouldEnsureNamespace) {
    await apiResources.api.v1.namespaces
      .create({ metadata: { name: namespace } })
      .catch(throwUnlessConflict)
  }

  // Expose a raw resource client extended with all helpers
  return extend(resourceClient, apiResources, resourceAliases)
}

module.exports = kubernetesClient

const get = require('lodash/get')

const throwUnlessConflict = error => {
  const code = get(error, 'response.data.code')
  if (code !== 409) throw error
}

module.exports.throwUnlessConflict = throwUnlessConflict

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Client } = require('@elastic/elasticsearch')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const config = require('../config/ESConfig')

const client = new Client({
  node: config.node,
  auth: config.auth
})

module.exports = client

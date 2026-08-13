/** A CommonJS module, of the shape a published npm package ships. */
const { counter } = require('./shared_cjs.cjs')

function greet(name) {
  return `hello ${name} #${counter.next()}`
}

module.exports = greet
module.exports.greet = greet
exports.VERSION = '1.0.0'

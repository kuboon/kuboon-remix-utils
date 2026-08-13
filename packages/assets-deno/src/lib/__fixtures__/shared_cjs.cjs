let value = 0

exports.counter = {
  next() {
    return ++value
  },
}

module.exports = function (req, res, next) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    // Converts POST to GET and move payload to query params
    // This way it will make JSON Server that it's GET request
    req.query = req.body
    req.query['updated_at'] = new Date().toISOString();
  }
  // Continue to JSON Server router
  next()
}

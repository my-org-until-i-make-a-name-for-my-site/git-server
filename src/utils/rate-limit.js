const rateLimit = require('express-rate-limit');

function createRateLimiter(options = {}) {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    ...options
  });
}
createRateLimiter();

module.exports = createRateLimiter;

const env = require('../../config/env');

// GBP_PROVIDER=mock lets the whole product run before Google approves API access.
const providers = {
  mock: require('./mock.provider'),
  live: require('./live.provider'),
};

function getProvider(kind = env.gbpProvider) {
  const provider = providers[kind];
  if (!provider) throw new Error(`Unknown GBP_PROVIDER "${kind}"`);
  return provider;
}

const STAR_TO_NUMBER = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

module.exports = { getProvider, STAR_TO_NUMBER };

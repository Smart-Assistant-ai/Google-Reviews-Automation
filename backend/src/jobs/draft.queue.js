// Tiny in-process queue so a big initial sync doesn't fire dozens of LLM calls at once.
// Swap for BullMQ (as in node-backend) when moving past the POC.
const CONCURRENCY = 3;
const queue = [];
let running = 0;

function next() {
  while (running < CONCURRENCY && queue.length) {
    const reviewId = queue.shift();
    running += 1;
    require('../services/draft.service')
      .draftForReview(reviewId)
      .catch((err) => console.error('[draft-queue]', reviewId, err.message))
      .finally(() => {
        running -= 1;
        next();
      });
  }
}

function push(reviewId) {
  queue.push(reviewId);
  next();
}

module.exports = { push, size: () => queue.length + running };

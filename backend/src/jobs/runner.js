const replyService = require('../services/reply.service');
const syncService = require('../services/sync.service');
const { Location } = require('../models');

// In-process scheduler for the POC. Production moves these to BullMQ workers (see design §9).
const FAST_TICK_MS = 3000;
const SYNC_EVERY_MS = 5 * 60 * 1000;

function guard(name, fn) {
  let busy = false;
  return async () => {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } catch (err) {
      console.error(`[job:${name}]`, err.message);
    } finally {
      busy = false;
    }
  };
}

function start() {
  const fast = guard('fast', async () => {
    await replyService.postDueScheduled();
    await replyService.refreshPending();
  });
  const sync = guard('sync', async () => {
    const locations = await Location.findAll({ where: { isSelected: true } });
    for (const l of locations) await syncService.syncLocation(l.id).catch((e) => console.warn('[sync]', l.id, e.message));
  });
  setInterval(fast, FAST_TICK_MS);
  setInterval(sync, SYNC_EVERY_MS);
}

module.exports = { start };

// One process only. Rate limits and Google call limits are counted in memory, so a second process
// would double them. Add Redis before raising this. Job runs are already safe if two ever overlap.
module.exports = {
  apps: [
    {
      name: 'replypilot-api',
      cwd: '/var/www/replypilot/apps/api',
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      // Lets running jobs and requests finish on restart. Matches the shutdown timeout in server.ts.
      kill_timeout: 35000,
      max_memory_restart: '700M',
      env: { NODE_ENV: 'production' },
    },
  ],
};

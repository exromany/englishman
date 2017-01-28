function log(prefix, message, ...args) {
  const now = new Date();
  if (args.length === 1 && args[0] === undefined) args =  [];
  console.log(`${now.toISOString()} ${prefix}:${message}`, ...args);
}

module.exports = log;

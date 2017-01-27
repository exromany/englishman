module.exports = function logger(prefix) {
  return (message, ...args) => {
    const now = new Date();
    console.log(`${now.toISOString()} ${prefix}:${message}`, ...args);
  };
};

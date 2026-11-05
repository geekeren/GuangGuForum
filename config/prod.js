module.exports = {
  env: {
    NODE_ENV: '"production"',
  },
  defineConstants: {},
  enableSourceMap: false,
  terser: {
    config: {
      // WeChat accepts UTF-8: keep Chinese text instead of larger \uXXXX escapes.
      output: { ascii_only: false },
    },
  },
  mini: {},
};

// Gatsby uses Babel to transpile TypeScript. The generated parser uses native
// private class methods (#method()) which require an explicit Babel plugin.
// We extend the Gatsby preset and add the transform here.
module.exports = {
  presets: [
    [
      'babel-preset-gatsby',
      {
        targets: { browsers: ['>0.5%', 'not dead', 'not ie <= 11', 'not op_mini all'] },
      },
    ],
  ],
  plugins: ['@babel/plugin-proposal-private-methods', '@babel/plugin-proposal-class-properties'],
};

const path = require('path')

const mode = process.env.NODE_ENV === 'development' ? 'development' : 'production'

module.exports = {
  target: 'node',
  entry: 'src/index.ts',
  mode,
  devtool: 'source-map',
  context: __dirname,
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    pathinfo: mode !== 'production',
    libraryTarget: 'umd',
    devtoolModuleFilenameTemplate: 'webpack-tabby-bianbu-mcp:///[resource-path]',
  },
  resolve: {
    modules: ['.', 'src', 'node_modules'].map(x => path.join(__dirname, x)),
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        options: {
          configFile: path.resolve(__dirname, 'tsconfig.json'),
        },
      },
      {
        test: /\.pug$/,
        use: [
          'apply-loader',
          'pug-loader',
        ],
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  externals: [
    'fs',
    /^rxjs/,
    /^@angular/,
    /^tabby-/,
  ],
}

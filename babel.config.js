module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // jsxImportSource enables NativeWind's className prop on RN primitives.
      // babel-preset-expo also applies the React Compiler (enabled in app.json).
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};

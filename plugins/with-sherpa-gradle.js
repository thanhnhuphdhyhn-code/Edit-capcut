const { withGradleProperties } = require("@expo/config-plugins");

/**
 * Piper synthesis does not use Sherpa's optional FFmpeg decoder.
 * Disabling it prevents duplicate native FFmpeg libraries in the Android build.
 */
module.exports = function withSherpaGradle(config) {
  return withGradleProperties(config, (configWithProperties) => {
    const properties = configWithProperties.modResults;
    const setProperty = (key, value) => {
      const found = properties.find((property) => property.type === "property" && property.key === key);
      if (found) found.value = value;
      else properties.push({ type: "property", key, value });
    };

    setProperty("sherpaOnnxDisableFfmpeg", "true");
    setProperty("sherpaOnnxDisableLibarchive", "false");
    return configWithProperties;
  });
};

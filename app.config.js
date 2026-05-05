module.exports = ({ config }) => {
  const androidKey =
    process.env.GOOGLE_MAPS_API_KEY_ANDROID ||
    process.env.GOOGLE_MAPS_API_KEY ||
    '';
  const iosKey =
    process.env.GOOGLE_MAPS_API_KEY_IOS ||
    process.env.GOOGLE_MAPS_API_KEY ||
    '';

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...(config.android?.config ?? {}),
        ...(androidKey ? { googleMaps: { apiKey: androidKey } } : {}),
      },
    },
    ios: {
      ...config.ios,
      config: {
        ...(config.ios?.config ?? {}),
        ...(iosKey ? { googleMapsApiKey: iosKey } : {}),
      },
    },
  };
};

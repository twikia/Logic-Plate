// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Resolve react-native-maps to a web stub on the web platform.
// react-native-maps imports native-only modules (codegenNativeCommands) that
// don't exist on web, causing the EAS web export to fail. Metro's platform-
// specific resolver handles this transparently — native builds are unaffected.
const webStubDir = path.resolve(__dirname, 'stubs');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return {
      filePath: path.join(webStubDir, 'react-native-maps.web.tsx'),
      type: 'sourceFile',
    };
  }
  // Fall through to the default resolver for everything else
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

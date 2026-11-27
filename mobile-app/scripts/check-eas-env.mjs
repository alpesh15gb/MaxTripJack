import { checkedApiOrigin } from '../src/api-transport.ts';

// Expo's release bundles cannot use the development loopback fallback.
if (process.env.EAS_BUILD_PROFILE !== 'development') {
  try {
    checkedApiOrigin(process.env.EXPO_PUBLIC_API_URL, false);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

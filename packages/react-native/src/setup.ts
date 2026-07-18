// This module is intentionally inert — it exists to hold this doc comment,
// not to be imported for its side effects. Importing a crypto polyfill from
// inside a library is the APP's job, not the library's: doing it here would
// silently shadow whatever polyfill (or native implementation) the app
// itself sets up, and would run every polyfill's setup code twice in apps
// that already import it.
//
// `@toony1908/stacks-passkey-react-native` (via `@stacks/transactions` /
// `@stacks/wallet-sdk`, and this package's own `passkey.ts`) calls
// `crypto.getRandomValues(...)`. Hermes/React Native does not provide a
// `crypto` global by default, so **the consuming app** must install it
// before this package is used — add this as the very first import in the
// app's entry point (e.g. `index.js`/`App.tsx`), above every other import:
//
// ```ts
// import 'react-native-get-random-values';
// ```
//
// `TextEncoder`/`TextDecoder` and `fetch` are assumed to already be present
// (React Native has provided `fetch` for a long time, and modern RN/Hermes
// versions include `TextEncoder`/`TextDecoder`; older setups may need
// `text-encoding`/`fast-text-encoding` similarly polyfilled at the app entry
// point).
export {};

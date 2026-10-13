# PICO authorization-code exchange contract

The device adapter **must reuse** the existing `@expo-pico/account` package from the separate `expo-pico` repository. The device calls `sendAuthScopesRequest([], 'auth-code')`. Spatial Auth never considers `openUid` from the JS/device profile to be valid proof.

The host server implements `exchangeAndConsume` via PICO's **actual developer-approved server identity endpoint**. The exchange must validate registered PICO app ID, one-use authorization-code redemption, issuer/subject and expiration. This PR validates the **attested return contract**; it does **not** know or fabricate official PICO exchange URLs. An app may enable this provider only after implementation against real PPS developer credentials and hardware.

```ts
import { createPicoServerVerifier } from 'spatial-auth/pico-server';

const verifyPicoAuthCode = createPicoServerVerifier({
  expectedAppId: process.env.PICO_PLATFORM_APP_ID!,
  exchangeAndConsume: yourOfficialPicoServerExchange,
});
```

Real device gates: PICO OS5/OS6, code replay, wrong app, timeout, cancellation, account switching, and Better Auth account linking without changing `user.id`. Follow `docs/PROVIDERS.md` and `docs/TESTING.md`.

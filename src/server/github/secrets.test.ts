import { describe, expect, it } from "vitest";
import _sodium from "libsodium-wrappers";
import { sealSecret } from "./secrets";

describe("sealSecret", () => {
  it("produces a sealed box the keypair owner can open back to the original value", async () => {
    await _sodium.ready;
    const sodium = _sodium;
    const keypair = sodium.crypto_box_keypair();
    const publicKeyB64 = sodium.to_base64(keypair.publicKey, sodium.base64_variants.ORIGINAL);

    const secret = "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----";
    const sealedB64 = await sealSecret(secret, publicKeyB64);

    const opened = sodium.crypto_box_seal_open(
      sodium.from_base64(sealedB64, sodium.base64_variants.ORIGINAL),
      keypair.publicKey,
      keypair.privateKey,
    );
    expect(sodium.to_string(opened)).toBe(secret);
  });
});

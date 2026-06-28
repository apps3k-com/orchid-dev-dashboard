import _sodium from "libsodium-wrappers";

/** Seal a secret value for the GitHub Actions secrets API using the target's base64 public key
 *  (libsodium sealed box, the format GitHub requires). Returns the base64 ciphertext. */
export async function sealSecret(value: string, publicKeyBase64: string): Promise<string> {
  await _sodium.ready;
  const sodium = _sodium;
  const key = sodium.from_base64(publicKeyBase64, sodium.base64_variants.ORIGINAL);
  const bytes = sodium.from_string(value);
  const sealed = sodium.crypto_box_seal(bytes, key);
  return sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
}

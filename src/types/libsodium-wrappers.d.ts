// Minimal ambient types for libsodium-wrappers (the published @types package is an empty,
// deprecated stub). Declares only the subset Orchid uses for GitHub secret sealing.
declare module "libsodium-wrappers" {
  type Base64Variants = { readonly ORIGINAL: number; readonly [variant: string]: number };

  export const ready: Promise<void>;
  export const base64_variants: Base64Variants;
  export function from_base64(input: string, variant?: number): Uint8Array;
  export function to_base64(input: Uint8Array, variant?: number): string;
  export function from_string(input: string): Uint8Array;
  export function to_string(input: Uint8Array): string;
  export function crypto_box_seal(message: Uint8Array, publicKey: Uint8Array): Uint8Array;
  export function crypto_box_seal_open(
    ciphertext: Uint8Array,
    publicKey: Uint8Array,
    privateKey: Uint8Array,
  ): Uint8Array;
  export function crypto_box_keypair(): {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
    keyType: string;
  };

  const sodium: {
    ready: Promise<void>;
    base64_variants: Base64Variants;
    from_base64: typeof from_base64;
    to_base64: typeof to_base64;
    from_string: typeof from_string;
    to_string: typeof to_string;
    crypto_box_seal: typeof crypto_box_seal;
    crypto_box_seal_open: typeof crypto_box_seal_open;
    crypto_box_keypair: typeof crypto_box_keypair;
  };
  export default sodium;
}

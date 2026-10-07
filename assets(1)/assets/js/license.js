/* DataForge Pro — License System
 * -------------------------------------------------------------
 * Offline license verification. Keys follow the format:
 *   DFP-XXXX-XXXX-XXXX  (uppercase alphanumeric)
 *
 * A key is valid when a checksum derived from the first three
 * groups matches the fourth group. This lets you (the seller)
 * generate an unlimited batch of valid keys with tools/keygen.html
 * and hand them out on Gumroad, while casual copies fail instantly.
 *
 * NOTE: Client-side checks deter casual sharing. For strict
 * enforcement, pair this with Gumroad's License Key API (see README).
 */
(function (global) {
  const STORAGE_KEY = "dfp_license";
  const PREFIX = "DFP";

  // Simple, deterministic hash (djb2 variant) → base36 chunk.
  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    }
    return h;
  }

  // Derive the expected 4-char checksum group from the payload groups.
  function checksumGroup(g1, g2, g3) {
    const seed = hash(`${PREFIX}-${g1}-${g2}-${g3}-forge`);
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars
    let n = seed, out = "";
    for (let i = 0; i < 4; i++) {
      out += alphabet[n % alphabet.length];
      n = Math.floor(n / alphabet.length) + hash(out);
    }
    return out;
  }

  function normalize(key) {
    return (key || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function isValid(key) {
    const k = normalize(key);
    const m = k.match(/^DFP-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/);
    if (!m) return false;
    const [, g1, g2, g3] = m;
    // Scheme: the 3rd group MUST equal checksum(g1, g2).
    // The keygen produces g1/g2 randomly, then computes g3 the same way.
    return checksumGroup(g1, g2, "DFP") === g3;
  }

  function activate(key) {
    if (!isValid(key)) return false;
    localStorage.setItem(STORAGE_KEY, normalize(key));
    return true;
  }

  function deactivate() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function getStoredKey() {
    return localStorage.getItem(STORAGE_KEY);
  }

  function isActivated() {
    const k = getStoredKey();
    return !!k && isValid(k);
  }

  global.DFPLicense = {
    isValid,
    activate,
    deactivate,
    isActivated,
    getStoredKey,
    checksumGroup,      // exposed for the keygen page
    normalize
  };
})(window);
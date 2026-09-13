// Production defaults to live. Test deployments must opt in explicitly.
export function marketplaceStripeLiveMode(key: string): boolean {
  const mode = process.env.STRIPE_MARKETPLACE_MODE ?? 'live';
  if (mode !== 'live' && mode !== 'test') throw new Error('invalid_marketplace_stripe_mode');
  if (!key.startsWith(`sk_${mode}_`) && !key.startsWith(`rk_${mode}_`)) {
    throw new Error('marketplace_stripe_key_mode_mismatch');
  }
  return mode === 'live';
}

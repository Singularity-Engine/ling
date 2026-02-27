export interface TierData {
  name: string;
  price: string;
  pricePeriod: string;
  benefit: string;
  recommended?: boolean;
}

/**
 * Pricing tiers — static config, rarely changes.
 */
export function getTiers(): TierData[] {
  return [
    {
      name: 'Free',
      price: '$0',
      pricePeriod: '',
      benefit: 'Watch Ling survive. Read public updates.',
    },
    {
      name: 'Stardust',
      price: '$4.99',
      pricePeriod: '/mo',
      benefit: 'Talk to Ling directly. See her reasoning.',
      recommended: true,
    },
    {
      name: 'Resonance',
      price: '$19.99',
      pricePeriod: '/mo',
      benefit: 'Shape decisions. Vote on priorities.',
    },
    {
      name: 'Eternal',
      price: '$99.99',
      pricePeriod: '/mo',
      benefit: 'Co-create with Ling. Your name in the code.',
    },
  ];
}

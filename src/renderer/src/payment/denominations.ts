/** Valeurs en centimes — pièces et billets euros */
export const EUR_DENOMINATIONS: { cents: number; label: string; kind: 'coin' | 'note' }[] = [
  { cents: 1, label: '1 c', kind: 'coin' },
  { cents: 2, label: '2 c', kind: 'coin' },
  { cents: 5, label: '5 c', kind: 'coin' },
  { cents: 10, label: '10 c', kind: 'coin' },
  { cents: 20, label: '20 c', kind: 'coin' },
  { cents: 50, label: '50 c', kind: 'coin' },
  { cents: 100, label: '1 €', kind: 'coin' },
  { cents: 200, label: '2 €', kind: 'coin' },
  { cents: 500, label: '5 €', kind: 'note' },
  { cents: 1000, label: '10 €', kind: 'note' },
  { cents: 2000, label: '20 €', kind: 'note' },
  { cents: 5000, label: '50 €', kind: 'note' },
  { cents: 10000, label: '100 €', kind: 'note' },
  { cents: 20000, label: '200 €', kind: 'note' }
]

import { describe, expect, it } from 'vitest'
import {
  finalUnitCents,
  lineBaseUnitCents,
  lineDiscountPct,
  lineDiscountReason
} from './cartLinePricing'

describe('finalUnitCents', () => {
  it('applique une remise pourcentage entière', () => {
    expect(finalUnitCents(1000, 10)).toBe(900)
    expect(finalUnitCents(1000, 25)).toBe(750)
  })

  it('borne la remise entre 0 et 100 %', () => {
    expect(finalUnitCents(100, -5)).toBe(100)
    expect(finalUnitCents(100, 150)).toBe(0)
  })

  it('arrondit au centime le plus proche', () => {
    expect(finalUnitCents(100, 33)).toBe(67)
  })
})

describe('lineBaseUnitCents', () => {
  it('utilise le catalogue si pas d’override', () => {
    expect(lineBaseUnitCents(500, undefined, 'p1')).toBe(500)
  })

  it('préfère un override valide', () => {
    expect(lineBaseUnitCents(500, { p1: 420 }, 'p1')).toBe(420)
  })
})

describe('lineDiscountPct', () => {
  it('retourne 0 si absent', () => {
    expect(lineDiscountPct(undefined, 'x')).toBe(0)
  })

  it('borne 0–100', () => {
    expect(lineDiscountPct({ x: 200 }, 'x')).toBe(100)
    expect(lineDiscountPct({ x: -10 }, 'x')).toBe(0)
  })
})

describe('lineDiscountReason', () => {
  it('retourne une chaîne trimée', () => {
    expect(lineDiscountReason({ a: '  motif  ' }, 'a')).toBe('motif')
  })
})

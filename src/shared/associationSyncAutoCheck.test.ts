import { describe, expect, it } from 'vitest'
import {
  ASSOCIATION_SYNC_AUTO_CHECK_INTERVAL_DEFAULT_SEC,
  ASSOCIATION_SYNC_AUTO_CHECK_INTERVAL_MAX_SEC,
  ASSOCIATION_SYNC_AUTO_CHECK_INTERVAL_MIN_SEC,
  sanitizeAssociationSyncAutoCheckIntervalSec
} from './catalog'

describe('sanitizeAssociationSyncAutoCheckIntervalSec', () => {
  it('retourne la valeur par défaut si invalide', () => {
    expect(sanitizeAssociationSyncAutoCheckIntervalSec(undefined)).toBe(
      ASSOCIATION_SYNC_AUTO_CHECK_INTERVAL_DEFAULT_SEC
    )
    expect(sanitizeAssociationSyncAutoCheckIntervalSec('abc')).toBe(
      ASSOCIATION_SYNC_AUTO_CHECK_INTERVAL_DEFAULT_SEC
    )
  })

  it('borne entre min et max', () => {
    expect(sanitizeAssociationSyncAutoCheckIntervalSec(1)).toBe(
      ASSOCIATION_SYNC_AUTO_CHECK_INTERVAL_MIN_SEC
    )
    expect(sanitizeAssociationSyncAutoCheckIntervalSec(99999)).toBe(
      ASSOCIATION_SYNC_AUTO_CHECK_INTERVAL_MAX_SEC
    )
    expect(sanitizeAssociationSyncAutoCheckIntervalSec(45)).toBe(45)
  })
})

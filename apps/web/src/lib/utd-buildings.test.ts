import { describe, expect, it } from 'vitest';
import { isPlace } from '@dallas-transit/shared';
import { matchBuilding, UTD_BUILDINGS } from './utd-buildings';
import { STUDENT_PLACES } from './student-places';

const match = (location: string) => {
  const found = matchBuilding(location);
  return found && { code: found.building.code, room: found.room };
};

describe('matchBuilding', () => {
  it.each([
    ['ECSW 1.315', 'ECSW', '1.315'],
    ['JSOM 2.106', 'JSOM', '2.106'],
    ['ecsw 1.315', 'ECSW', '1.315'],
    ['ECSW1.315', 'ECSW', '1.315'],
    ['ECSW 1.315 (Clark Auditorium)', 'ECSW', '1.315'],
    ['Room: JSOM 12.206, Richardson, TX', 'JSOM', '12.206'],
    ['GR 2.302', 'GR', '2.302'],
    ['SLC 1.102A', 'SLC', '1.102A'],
    ['SPN2 11.213', 'SP2', '11.213'],
    ['SOM 4.409', 'JSOM', '4.409'],
    ['APC1 1.309', 'APC', '1.309'],
  ])('reads %s as a building and room', (location, code, room) => {
    expect(match(location)).toEqual({ code, room });
  });

  it('reads an official building name or a bare code', () => {
    expect(match('Engineering and Computer Science West 1.315')).toEqual({
      code: 'ECSW',
      room: '1.315',
    });
    expect(match('Eugene McDermott Library')).toEqual({
      code: 'MC',
      room: undefined,
    });
    expect(match(' su ')).toEqual({ code: 'SU', room: undefined });
    // the longer official name wins when one name contains another
    expect(match('Callier Center Richardson Addition')?.code).toBe('CRA');
  });

  it.each(['', 'Online', 'TBA', 'To be announced', 'XYZ 1.100', 'Room 1.315'])(
    'does not guess a building for %j',
    (location) => expect(matchBuilding(location)).toBeNull(),
  );

  it('matches a building whose entrance is not on the official map', () => {
    expect(matchBuilding('ROC 2.103')?.building).toMatchObject({
      code: 'ROC',
      name: 'Research and Operations Center',
    });
    expect(matchBuilding('ROC 2.103')?.building.entrance).toBeUndefined();
  });
});

describe('UTD building catalog', () => {
  it('has unique codes and aliases', () => {
    const codes = UTD_BUILDINGS.flatMap((b) => [b.code, ...(b.aliases ?? [])]);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('places every entrance on the Richardson campus with its map record', () => {
    for (const { code, entrance } of UTD_BUILDINGS) {
      if (!entrance) continue;
      expect(entrance.latitude, code).toBeGreaterThan(32.98);
      expect(entrance.latitude, code).toBeLessThan(33.0);
      expect(entrance.longitude, code).toBeGreaterThan(-96.76);
      expect(entrance.longitude, code).toBeLessThan(-96.74);
      expect(entrance.mapLocationId, code).toBeGreaterThan(0);
    }
  });
});

describe('student places', () => {
  it('are storable places in the Dallas area, each with a source', () => {
    expect(STUDENT_PLACES.map((p) => p.name)).toEqual([
      'UT Dallas',
      'SMU',
      'UNT Dallas',
      'Northside',
      'Deep Ellum',
      'DFW Airport',
      'Dallas Love Field',
    ]);
    for (const { source, ...place } of STUDENT_PLACES) {
      expect(isPlace(place), place.name).toBe(true);
      expect(place.temporary).toBeUndefined();
      expect(place.latitude).toBeGreaterThan(32.6);
      expect(place.latitude).toBeLessThan(33.1);
      expect(place.longitude).toBeGreaterThan(-97.1);
      expect(place.longitude).toBeLessThan(-96.6);
      expect(source.length).toBeGreaterThan(10);
    }
  });
});

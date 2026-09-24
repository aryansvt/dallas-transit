export interface ReferenceCase {
  id: string;
  date: string;
  from: string;
  to: string;
  departure: number;
  maxTransfers: number;
  purpose: string;
}

export const corpus: readonly ReferenceCase[] = [
  {
    id: 'direct-alternatives',
    date: '2026-09-18',
    from: '22749',
    to: '26895',
    departure: 28800,
    maxTransfers: 3,
    purpose: 'West End to CityLine/Bush; Orange and Red alternatives',
  },
  {
    id: 'one-transfer',
    date: '2026-09-18',
    from: '32562',
    to: '32553',
    departure: 28800,
    maxTransfers: 3,
    purpose: 'Downtown Rowlett to DFW Airport; Blue to Orange',
  },
  {
    id: 'pareto-alternatives',
    date: '2026-09-18',
    from: '33221',
    to: '33318',
    departure: 28800,
    maxTransfers: 3,
    purpose: 'Earlier arrival with one transfer versus a later direct bus',
  },
  {
    id: 'transfer-bound',
    date: '2026-09-18',
    from: '32562',
    to: '32553',
    departure: 28800,
    maxTransfers: 0,
    purpose: 'Same journey with no transfers allowed',
  },
  {
    id: 'after-midnight',
    date: '2026-09-18',
    from: '33286',
    to: '15842',
    departure: 86400,
    maxTransfers: 0,
    purpose: 'Friday service 24:06 bus, queried at Saturday civil midnight',
  },
  {
    id: 'saturday-calendar',
    date: '2026-09-19',
    from: '22749',
    to: '26895',
    departure: 28800,
    maxTransfers: 3,
    purpose: 'Same station pair on Saturday services',
  },
  {
    id: 'sunday-calendar',
    date: '2026-09-20',
    from: '22749',
    to: '26895',
    departure: 28800,
    maxTransfers: 3,
    purpose: 'Same station pair on Sunday services',
  },
  {
    id: 'sunday-bus',
    date: '2026-09-20',
    from: '33286',
    to: '15842',
    departure: 28800,
    maxTransfers: 0,
    purpose:
      'Sunday bus service is active even though this publication has no Sunday rail on the tested pair',
  },
  {
    id: 'loop-second-visit',
    date: '2026-09-18',
    from: '19754',
    to: '19756',
    departure: 14700,
    maxTransfers: 0,
    purpose: 'Miss first visit at 04:04:59; board repeated stop at 04:07:47',
  },
  {
    id: 'boarding-boundary',
    date: '2026-09-18',
    from: '22749',
    to: '26895',
    departure: 29040,
    maxTransfers: 0,
    purpose: 'At-stop zero-access boundary: exactly on departure',
  },
  {
    id: 'missed-boundary',
    date: '2026-09-18',
    from: '22749',
    to: '26895',
    departure: 29041,
    maxTransfers: 0,
    purpose: 'One second later must miss the 08:04 departure',
  },
];

'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { TransitApp } from '../components/transit-app';
import {
  previewClient,
  previewSetup,
  scenarios,
  type Scenario,
} from './fixtures';

export function PreviewWorkspace({
  initialScenario,
  embedded,
}: {
  initialScenario: Scenario;
  embedded: boolean;
}) {
  const [scenario, setScenario] = useState(initialScenario);
  const [width, setWidth] = useState('responsive');
  const setup = useMemo(() => previewSetup(scenario), [scenario]);
  return (
    <>
      <aside
        className="preview-toolbar"
        aria-label="Developer preview controls"
      >
        <p>
          <strong>M6 developer preview</strong>
          <br />
          Synthetic places, times and connections. Points-only map; no streets
          or route geometry. Not for travel. About opens in a separate tab; your
          preview stays here.
        </p>
        {!embedded && (
          <>
            <label>
              Review state
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value as Scenario)}
              >
                {Object.entries(scenarios).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Viewport
              <select value={width} onChange={(e) => setWidth(e.target.value)}>
                <option value="responsive">Responsive / desktop</option>
                <option value="320">Narrow mobile · 320 px</option>
                <option value="390">Mobile · 390 px</option>
                <option value="768">Tablet · 768 px</option>
              </select>
            </label>
            <Link href="/">Normal local mode</Link>
          </>
        )}
      </aside>
      {width === 'responsive' || embedded ? (
        <TransitApp key={scenario} client={previewClient} preview={setup} />
      ) : (
        <iframe
          key={`${scenario}-${width}`}
          className="preview-viewport"
          title={`${scenarios[scenario]} at ${width} pixels`}
          src={`/preview?embedded=1&state=${scenario}`}
          style={{
            width: Number(width),
            maxWidth: '100%',
            height: 940,
            display: 'block',
            margin: '24px auto',
            border: '1px solid #d9dcd5',
            background: '#f6f5f0',
          }}
        />
      )}
    </>
  );
}

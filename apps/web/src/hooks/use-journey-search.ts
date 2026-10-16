'use client';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  GeographicRequest,
  JourneyResponse,
} from '@dallas-transit/shared';
import { errorMessage, type TransitClient } from '../lib/api';
import type { PreviewSetup } from '../lib/preview-setup';

/** One search session: request, results, selection and replanned options. */
export function useJourneySearch(
  client: TransitClient,
  preview: PreviewSetup | undefined,
) {
  const [request, setRequest] = useState<{
    id: number;
    input: GeographicRequest;
  } | null>(null);
  const [fixtureInitial, setFixtureInitial] = useState(true);
  const [replacement, setReplacement] = useState<JourneyResponse | null>(null);
  const [routeReason, setRouteReason] = useState('');
  const [selected, setSelected] = useState(preview?.detail ?? 0);
  const [detail, setDetail] = useState(preview?.detail !== undefined);
  const [message, setMessage] = useState(preview?.error ?? '');
  const [busyPreview, setBusyPreview] = useState(preview?.loading ?? false);
  const sequence = useRef(0);
  const search = useQuery({
    queryKey: ['journeys', request?.id],
    queryFn: ({ signal }) => client.journeys(request!.input, signal),
    enabled: request !== null,
  });
  const data =
    replacement ?? search.data ?? (fixtureInitial ? preview?.data : undefined);
  const result = data?.status === 'ok' ? data : undefined;
  const journey = result?.journeys[selected] ?? result?.journeys[0];
  const clearReplacement = () => {
    setReplacement(null);
    setRouteReason('');
  };
  return {
    data,
    result,
    journey,
    selected,
    detail,
    routeReason,
    loading: busyPreview || search.isFetching,
    error: search.error ? errorMessage(search.error) : message,
    liveId: detail ? result?.liveJourneyIds?.[selected] : undefined,
    clearReplacement,
    reset(nextMessage = '') {
      clearReplacement();
      setRequest(null);
      setFixtureInitial(false);
      setDetail(false);
      setMessage(nextMessage);
      setBusyPreview(false);
    },
    /** False when the departure cannot become a request; the reason is shown. */
    start(input: () => GeographicRequest) {
      setMessage('');
      setFixtureInitial(false);
      setBusyPreview(false);
      setDetail(false);
      setSelected(0);
      try {
        const next = input();
        setRequest({ id: ++sequence.current, input: next });
        return true;
      } catch (e) {
        // results from an earlier search must not sit under this error
        setRequest(null);
        setMessage(
          e instanceof Error ? e.message : 'Check your departure time.',
        );
        return false;
      }
    },
    show(index: number) {
      setSelected(index);
      setDetail(true);
    },
    hide() {
      setDetail(false);
    },
    replace(next: JourneyResponse, reason: string) {
      setReplacement(next);
      setRouteReason(reason);
      setSelected(0);
      setDetail(false);
    },
  };
}

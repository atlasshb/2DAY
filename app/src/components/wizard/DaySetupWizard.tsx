"use client";

/**
 * The Day Setup wizard — WIZARD-BRIEF. First-run flow (and re-runnable via
 * Today's "Edit my day"): one step per screen, mobile sheet, back where
 * marked. Everything collected here is saved to Dexie's `dayProfile`
 * (`lib/dayProfile.ts`) and never leaves the phone — the one exception,
 * stated in the copy below, is the work-area geocode and mosque search,
 * which hit OpenStreetMap (Nominatim/Overpass) when online.
 *
 * Mirrors the doorstep recorder's sheet pattern (components/coach/RecordSheet.tsx):
 * a `phase`-driven single component, portaled into #app so it can't be
 * clipped by AppShell's scrolling `.content`.
 */
import { useEffect, useMemo, useState } from "react";
import type { AsrMadhab, PrayerCalcMethod } from "@2day/core";
import { computePrayerTimesISO, schedulePrayerStops } from "@2day/core";
import {
  SETTINGS_KEYS,
  getSetting,
  saveDayProfile,
  setSetting,
  todayKey,
  type DayProfile,
  type WizardMosque,
  type WizardPlace,
} from "@/lib/dayProfile";
import type { DayProfileRow } from "@/lib/offline/db";
import { geocodeSearch, type GeocodeMatch } from "@/lib/wizard/geocode";
import { findNearbyMosques, type MosqueResult } from "@/lib/wizard/mosques";
import { formatDistance } from "@/lib/geoMath";
import { startTrail } from "@/lib/tracer";

const STEP_LABELS = {
  location: "Where are you",
  workArea: "Work area",
  hours: "Work hours",
  bag: "Bag",
  prayerEnable: "Prayer stops",
  prayerSettings: "Prayer method",
  prayerCombine: "Combine prayers",
  mosque: "Mosque nearby",
  summary: "Compile my day",
} as const;
type Step = keyof typeof STEP_LABELS;

interface Draft {
  location: WizardPlace | null;
  workArea: WizardPlace | null;
  hoursStart: string; // "HH:MM"
  hoursEnd: string; // "HH:MM"
  bag: boolean;
  locker: boolean;
  prayerEnabled: boolean;
  method: PrayerCalcMethod;
  asrMadhab: AsrMadhab;
  combineDhuhrAsr: boolean;
  combineMaghribIsha: boolean;
  mosque: WizardMosque | null;
}

function stepOrder(draft: Draft): Step[] {
  const steps: Step[] = ["location", "workArea", "hours", "bag", "prayerEnable"];
  if (draft.prayerEnabled) steps.push("prayerSettings", "prayerCombine", "mosque");
  steps.push("summary");
  return steps;
}

function draftFromExisting(existing: DayProfileRow | null | undefined): Partial<Draft> {
  if (!existing) return {};
  return {
    location: existing.location,
    workArea: existing.workArea,
    hoursStart: existing.hours.startAt.slice(11, 16),
    hoursEnd: existing.hours.endAt.slice(11, 16),
    bag: existing.bag,
    locker: existing.locker,
    prayerEnabled: existing.prayerPlan.enabled,
    method: existing.prayerPlan.method,
    asrMadhab: existing.prayerPlan.asrMadhab,
    combineDhuhrAsr: existing.prayerPlan.combineDhuhrAsr,
    combineMaghribIsha: existing.prayerPlan.combineMaghribIsha,
    mosque: existing.prayerPlan.mosque ?? null,
  };
}

/** Combines today's date with an "HH:MM" field into an offset ISODateTime,
 *  using the device's current UTC offset (today, this location). */
function todayIso(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h ?? 12, m ?? 0, 0, 0);
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00${offset}`
  );
}

export function DaySetupWizard({
  existing,
  onClose,
  onSaved,
}: {
  existing?: DayProfileRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<Step>("location");
  const [draft, setDraft] = useState<Draft>(() => ({
    location: null,
    workArea: null,
    hoursStart: "12:00",
    hoursEnd: "18:00",
    bag: false,
    locker: false,
    prayerEnabled: false,
    method: "MWL",
    asrMadhab: "standard",
    combineDhuhrAsr: false,
    combineMaghribIsha: false,
    mosque: null,
    ...draftFromExisting(existing),
  }));
  const [saving, setSaving] = useState(false);

  // Remembered defaults (bag/locker/prayer prefs) on a genuinely fresh start.
  useEffect(() => {
    if (existing) return;
    (async () => {
      const [bag, locker, prayerEnabled, method, asrMadhab, combineDhuhrAsr, combineMaghribIsha] =
        await Promise.all([
          getSetting(SETTINGS_KEYS.bagDefault, false),
          getSetting(SETTINGS_KEYS.lockerDefault, false),
          getSetting(SETTINGS_KEYS.prayerEnabledDefault, false),
          getSetting<PrayerCalcMethod>(SETTINGS_KEYS.prayerMethod, "MWL"),
          getSetting<AsrMadhab>(SETTINGS_KEYS.asrMadhab, "standard"),
          getSetting(SETTINGS_KEYS.combineDhuhrAsr, false),
          getSetting(SETTINGS_KEYS.combineMaghribIsha, false),
        ]);
      setDraft((d) => ({
        ...d,
        bag,
        locker,
        prayerEnabled,
        method,
        asrMadhab,
        combineDhuhrAsr,
        combineMaghribIsha,
      }));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, []);

  const order = stepOrder(draft);
  const index = order.indexOf(step);

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  /**
   * Advances to the next step, optionally applying a patch first. The patch
   * is folded into the SAME `setDraft` updater that computes the next step
   * — steps whose "yes/no" tap both records an answer and advances in one
   * handler (location, work area, prayer-enable, mosque) would otherwise
   * compute `stepOrder` from the stale pre-patch `draft` closure, since
   * `setDraft` is async and hasn't re-rendered yet when `goNext` runs.
   */
  function goNext(pendingPatch?: Partial<Draft>) {
    setDraft((d) => {
      const next = pendingPatch ? { ...d, ...pendingPatch } : d;
      const order = stepOrder(next);
      const i = order.indexOf(step);
      if (i < order.length - 1) setStep(order[i + 1]!);
      return next;
    });
  }
  function goBack() {
    if (index > 0) setStep(order[index - 1]!);
    else onClose();
  }

  async function handleFinish() {
    setSaving(true);
    const hoursStartIso = todayIso(draft.hoursStart);
    const hoursEndIso = todayIso(draft.hoursEnd);
    const profile: DayProfile = {
      location: draft.location ?? { source: "manual", label: "Not set" },
      workArea: draft.workArea ?? { source: "manual", label: "Not set" },
      hours: { startAt: hoursStartIso, endAt: hoursEndIso },
      bag: draft.bag,
      locker: draft.bag && draft.locker,
      prayerPlan: {
        enabled: draft.prayerEnabled,
        method: draft.method,
        asrMadhab: draft.asrMadhab,
        combineDhuhrAsr: draft.combineDhuhrAsr,
        combineMaghribIsha: draft.combineMaghribIsha,
        mosque: draft.mosque ?? undefined,
      },
      createdAt: new Date().toISOString(),
    };
    await saveDayProfile(todayKey(), profile);
    await Promise.all([
      setSetting(SETTINGS_KEYS.bagDefault, draft.bag),
      setSetting(SETTINGS_KEYS.lockerDefault, draft.locker),
      setSetting(SETTINGS_KEYS.prayerEnabledDefault, draft.prayerEnabled),
      setSetting(SETTINGS_KEYS.prayerMethod, draft.method),
      setSetting(SETTINGS_KEYS.asrMadhab, draft.asrMadhab),
      setSetting(SETTINGS_KEYS.combineDhuhrAsr, draft.combineDhuhrAsr),
      setSetting(SETTINGS_KEYS.combineMaghribIsha, draft.combineMaghribIsha),
    ]);
    setSaving(false);
    onSaved();
  }

  return (
    <div className="recsheet full" data-testid="day-setup-wizard" role="dialog" aria-label="Set up your day">
      <div className="grab" />
      <div className="recsheethead">
        <span className="recsheettitle">{STEP_LABELS[step]}</span>
        <button type="button" className="recclose" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="wizprogress" aria-hidden="true">
        {order.map((s, i) => (
          <i key={s} className={i <= index ? "done" : ""} />
        ))}
      </div>

      <div className="reccardbody">
        {step === "location" && <LocationStep draft={draft} patch={patch} onNext={goNext} />}
        {step === "workArea" && <WorkAreaStep draft={draft} patch={patch} onNext={goNext} />}
        {step === "hours" && <HoursStep draft={draft} patch={patch} onNext={goNext} />}
        {step === "bag" && <BagStep draft={draft} patch={patch} onNext={goNext} />}
        {step === "prayerEnable" && <PrayerEnableStep draft={draft} patch={patch} onNext={goNext} />}
        {step === "prayerSettings" && <PrayerSettingsStep draft={draft} patch={patch} onNext={goNext} />}
        {step === "prayerCombine" && <PrayerCombineStep draft={draft} patch={patch} onNext={goNext} />}
        {step === "mosque" && <MosqueStep draft={draft} patch={patch} onNext={goNext} />}
        {step === "summary" && (
          <SummaryStep draft={draft} saving={saving} onFinish={() => void handleFinish()} />
        )}
      </div>

      {step !== "location" && (
        <div className="wizfoot">
          <button type="button" className="ghost" onClick={goBack}>
            Back
          </button>
        </div>
      )}
    </div>
  );
}

/* ============ Step 1: Location ============ */

function LocationStep({
  onNext,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  onNext: (patch?: Partial<Draft>) => void;
}) {
  // "denied" also covers a rep who just prefers to type — reached either by
  // an actual browser permission denial or by tapping "Enter location
  // manually" below, so the manual path never requires waiting out a
  // permission prompt.
  const [state, setState] = useState<"idle" | "asking" | "denied">("idle");
  const [manual, setManual] = useState("");

  function requestGps() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("denied");
      return;
    }
    setState("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Also primes the Day Trail (TRAIL-BRIEF) — the rep already granted
        // location just now, so start the foreground breadcrumb immediately.
        startTrail();
        onNext({
          location: {
            source: "gps",
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            label: "Current location",
          },
        });
      },
      () => setState("denied"),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  }

  async function useManual() {
    const label = manual.trim();
    if (!label) return;
    const matches = await geocodeSearch(label, 1);
    const best = matches[0];
    onNext({
      location: best
        ? { source: "geocoded", lat: best.lat, lng: best.lng, label: best.label }
        : { source: "manual", label },
    });
  }

  return (
    <div className="wizstep">
      <p className="wizcopy">
        2DAY plans your day around where you are — and where you&apos;re headed. Sharing your
        location also starts today&apos;s Trail (Route tab), so you can retrace your day later.
        Nothing here leaves your phone.
      </p>
      {state !== "denied" ? (
        <>
          <button
            type="button"
            className="primary"
            data-testid="wizard-share-location"
            disabled={state === "asking"}
            onClick={requestGps}
          >
            {state === "asking" ? "Requesting…" : "Share my location"}
          </button>
          <button
            type="button"
            className="ghost"
            data-testid="wizard-location-manual-btn"
            onClick={() => setState("denied")}
          >
            Enter location manually
          </button>
        </>
      ) : (
        <div className="wizfield">
          <label htmlFor="wiz-manual-location">Where are you now?</label>
          <input
            id="wiz-manual-location"
            className="wizinput"
            placeholder="City, street, or area"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            data-testid="wizard-manual-location"
          />
          <button
            type="button"
            className="primary"
            onClick={() => void useManual()}
            disabled={!manual.trim()}
            data-testid="wizard-manual-location-submit"
          >
            Use this
          </button>
        </div>
      )}
    </div>
  );
}

/* ============ Step 2: Work area ============ */

function WorkAreaStep({
  draft,
  onNext,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  onNext: (patch?: Partial<Draft>) => void;
}) {
  const [query, setQuery] = useState(draft.workArea?.label ?? "");
  const [matches, setMatches] = useState<GeocodeMatch[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);

  async function search() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    const results = await geocodeSearch(q, 3);
    setMatches(results);
    setSearched(true);
    setSearching(false);
  }

  function pick(m: GeocodeMatch) {
    onNext({ workArea: { source: "geocoded", lat: m.lat, lng: m.lng, label: m.label } });
  }

  function useAsTyped() {
    const q = query.trim();
    if (!q) return;
    onNext({ workArea: { source: "manual", label: q } });
  }

  return (
    <div className="wizstep">
      <p className="wizcopy">Where do you plan to work today? City, area, or street.</p>
      <div className="wizfield">
        <input
          className="wizinput"
          placeholder="e.g. Groenewoud, Tilburg"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="wizard-workarea-input"
        />
        <button
          type="button"
          className="primary"
          onClick={() => void search()}
          disabled={!query.trim() || searching}
          data-testid="wizard-workarea-search"
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </div>

      {matches.length > 0 && (
        <div className="wizoptions" data-testid="wizard-workarea-matches">
          {matches.map((m) => (
            <button
              key={`${m.lat},${m.lng}`}
              type="button"
              className="wizoption"
              onClick={() => pick(m)}
            >
              <b>{m.label}</b>
            </button>
          ))}
        </div>
      )}

      {searched && matches.length === 0 && (
        <p className="wizhint">No online match — we&apos;ll plan without coordinates.</p>
      )}

      {(searched || (typeof navigator !== "undefined" && navigator.onLine === false)) && (
        <button type="button" className="ghost" onClick={useAsTyped} data-testid="wizard-workarea-manual">
          Use &quot;{query}&quot; as typed
        </button>
      )}
    </div>
  );
}

/* ============ Step 3: Work hours ============ */

function HoursStep({
  draft,
  patch,
  onNext,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  onNext: () => void;
}) {
  return (
    <div className="wizstep">
      <p className="wizcopy">What are today&apos;s work hours?</p>
      <div className="wizfield">
        <label htmlFor="wiz-hours-start">Start</label>
        <input
          id="wiz-hours-start"
          type="time"
          className="wizinput"
          value={draft.hoursStart}
          onChange={(e) => patch({ hoursStart: e.target.value })}
          data-testid="wizard-hours-start"
        />
      </div>
      <div className="wizfield">
        <label htmlFor="wiz-hours-end">End</label>
        <input
          id="wiz-hours-end"
          type="time"
          className="wizinput"
          value={draft.hoursEnd}
          onChange={(e) => patch({ hoursEnd: e.target.value })}
          data-testid="wizard-hours-end"
        />
      </div>
      <button
        type="button"
        className="primary"
        disabled={draft.hoursStart >= draft.hoursEnd}
        onClick={() => onNext()}
        data-testid="wizard-hours-next"
      >
        Continue
      </button>
    </div>
  );
}

/* ============ Step 4: Bag ============ */

function BagStep({
  draft,
  patch,
  onNext,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  onNext: () => void;
}) {
  return (
    <div className="wizstep">
      <p className="wizcopy">Carrying a bag today?</p>
      <div className="wizrow">
        <button
          type="button"
          className={`choice${draft.bag ? " selected" : ""}`}
          onClick={() => patch({ bag: true })}
          data-testid="wizard-bag-yes"
        >
          Yes
        </button>
        <button
          type="button"
          className={`choice${!draft.bag ? " selected" : ""}`}
          onClick={() => patch({ bag: false, locker: false })}
          data-testid="wizard-bag-no"
        >
          No
        </button>
      </div>

      {draft.bag && (
        <>
          <p className="wizcopy">Want a locker or drop point on the route?</p>
          <div className="wizrow">
            <button
              type="button"
              className={`choice${draft.locker ? " selected" : ""}`}
              onClick={() => patch({ locker: true })}
              data-testid="wizard-locker-yes"
            >
              Yes
            </button>
            <button
              type="button"
              className={`choice${!draft.locker ? " selected" : ""}`}
              onClick={() => patch({ locker: false })}
              data-testid="wizard-locker-no"
            >
              No
            </button>
          </div>
        </>
      )}

      <button type="button" className="primary" onClick={() => onNext()} data-testid="wizard-bag-next">
        Continue
      </button>
    </div>
  );
}

/* ============ Step 5: Prayer stops? ============ */

function PrayerEnableStep({
  draft,
  onNext,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  onNext: (patch?: Partial<Draft>) => void;
}) {
  return (
    <div className="wizstep">
      <p className="wizcopy">Plan prayer stops into today&apos;s route?</p>
      <div className="wizrow">
        <button
          type="button"
          className={`choice${draft.prayerEnabled ? " selected" : ""}`}
          onClick={() => onNext({ prayerEnabled: true })}
          data-testid="wizard-prayer-yes"
        >
          Yes
        </button>
        <button
          type="button"
          className={`choice${!draft.prayerEnabled ? " selected" : ""}`}
          onClick={() => onNext({ prayerEnabled: false })}
          data-testid="wizard-prayer-no"
        >
          No
        </button>
      </div>
    </div>
  );
}

/* ============ Step 5a: method + madhab ============ */

function PrayerSettingsStep({
  draft,
  patch,
  onNext,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  onNext: () => void;
}) {
  return (
    <div className="wizstep">
      <div className="wizfield">
        <label>Calculation method</label>
        <div className="wizrow">
          <button
            type="button"
            className={`choice${draft.method === "MWL" ? " selected" : ""}`}
            onClick={() => patch({ method: "MWL" })}
            data-testid="wizard-method-mwl"
          >
            MWL (18°/17°)
          </button>
          <button
            type="button"
            className={`choice${draft.method === "ISNA" ? " selected" : ""}`}
            onClick={() => patch({ method: "ISNA" })}
            data-testid="wizard-method-isna"
          >
            ISNA (15°/15°)
          </button>
        </div>
      </div>
      <div className="wizfield">
        <label>Asr madhab</label>
        <div className="wizrow">
          <button
            type="button"
            className={`choice${draft.asrMadhab === "standard" ? " selected" : ""}`}
            onClick={() => patch({ asrMadhab: "standard" })}
            data-testid="wizard-madhab-standard"
          >
            Standard
          </button>
          <button
            type="button"
            className={`choice${draft.asrMadhab === "hanafi" ? " selected" : ""}`}
            onClick={() => patch({ asrMadhab: "hanafi" })}
            data-testid="wizard-madhab-hanafi"
          >
            Hanafi
          </button>
        </div>
      </div>
      <button type="button" className="primary" onClick={() => onNext()} data-testid="wizard-settings-next">
        Continue
      </button>
    </div>
  );
}

/* ============ Step 5b: combine (jam') ============ */

function PrayerCombineStep({
  draft,
  patch,
  onNext,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  onNext: () => void;
}) {
  const preview = useMemo(() => {
    const point = draft.workArea ?? draft.location;
    if (!point?.lat || !point.lng) return null;
    const now = new Date();
    const times = computePrayerTimesISO({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      lat: point.lat,
      lng: point.lng,
      utcOffsetMinutes: -now.getTimezoneOffset(),
      method: draft.method,
      asrMadhab: draft.asrMadhab,
    });
    return times;
  }, [draft.workArea, draft.location, draft.method, draft.asrMadhab]);

  return (
    <div className="wizstep">
      <p className="wizcopy">Combine prayers (jam&apos;)?</p>
      <div className="wizfield">
        <label>Dhuhr + Asr</label>
        <div className="wizrow">
          <button
            type="button"
            className={`choice${draft.combineDhuhrAsr ? " selected" : ""}`}
            onClick={() => patch({ combineDhuhrAsr: true })}
            data-testid="wizard-combine-dhuhrasr-yes"
          >
            Combine
          </button>
          <button
            type="button"
            className={`choice${!draft.combineDhuhrAsr ? " selected" : ""}`}
            onClick={() => patch({ combineDhuhrAsr: false })}
            data-testid="wizard-combine-dhuhrasr-no"
          >
            Separate
          </button>
        </div>
      </div>
      <div className="wizfield">
        <label>Maghrib + Isha</label>
        <div className="wizrow">
          <button
            type="button"
            className={`choice${draft.combineMaghribIsha ? " selected" : ""}`}
            onClick={() => patch({ combineMaghribIsha: true })}
            data-testid="wizard-combine-maghribisha-yes"
          >
            Combine
          </button>
          <button
            type="button"
            className={`choice${!draft.combineMaghribIsha ? " selected" : ""}`}
            onClick={() => patch({ combineMaghribIsha: false })}
            data-testid="wizard-combine-maghribisha-no"
          >
            Separate
          </button>
        </div>
      </div>

      {preview && (
        <div className="card" data-testid="wizard-prayer-preview">
          <div className="cardtitle">Today&apos;s times (computed on device)</div>
          <div className="wizrecap">
            {(["fajr", "dhuhr", "asr", "maghrib", "isha"] as const).map((k) => (
              <div className="wizrecaprow" key={k}>
                <span className="k">{k[0]!.toUpperCase() + k.slice(1)}</span>
                <span className="v">{preview[k].slice(11, 16)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button type="button" className="primary" onClick={() => onNext()} data-testid="wizard-combine-next">
        Continue
      </button>
    </div>
  );
}

/* ============ Step 5c: mosque nearby ============ */

function MosqueStep({
  draft,
  onNext,
}: {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  onNext: (patch?: Partial<Draft>) => void;
}) {
  const point = draft.workArea?.lat != null ? draft.workArea : draft.location;
  const [results, setResults] = useState<MosqueResult[] | null>(null);
  const [manualName, setManualName] = useState("");

  useEffect(() => {
    if (!point?.lat || !point.lng) {
      setResults([]);
      return;
    }
    let cancelled = false;
    void findNearbyMosques(point.lat, point.lng).then((r) => {
      if (!cancelled) setResults(r);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point?.lat, point?.lng]);

  function pick(m: MosqueResult) {
    onNext({ mosque: { name: m.name, lat: m.lat, lng: m.lng, distanceM: m.distanceM, manual: false } });
  }

  function useManual() {
    const name = manualName.trim();
    if (!name) return;
    onNext({ mosque: { name, manual: true } });
  }

  function skip() {
    onNext({ mosque: null });
  }

  return (
    <div className="wizstep">
      <p className="wizcopy">
        Is there a mosque near your work area you&apos;d like on the route?
      </p>

      {results === null && point?.lat != null && <p className="wizcopy">Searching nearby…</p>}

      {results && results.length > 0 && (
        <div className="wizoptions" data-testid="wizard-mosque-results">
          {results.map((m) => (
            <button key={m.id} type="button" className="wizoption" onClick={() => pick(m)}>
              <b>{m.name}</b>
              <span>{formatDistance(m.distanceM)} walk</span>
            </button>
          ))}
        </div>
      )}

      {results && results.length === 0 && (
        <p className="wizhint">
          {point?.lat != null ? "No mosque found nearby." : "No coordinates for your work area."}
        </p>
      )}

      <div className="wizfield">
        <label htmlFor="wiz-mosque-manual">I know a place</label>
        <input
          id="wiz-mosque-manual"
          className="wizinput"
          placeholder="Mosque name or address"
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
          data-testid="wizard-mosque-manual-input"
        />
        <button
          type="button"
          className="ghost"
          onClick={useManual}
          disabled={!manualName.trim()}
          data-testid="wizard-mosque-manual-submit"
        >
          Use this place
        </button>
      </div>

      <button type="button" className="primary" onClick={skip} data-testid="wizard-mosque-skip">
        Skip — no mosque stop
      </button>
    </div>
  );
}

/* ============ Step 6: Summary ============ */

function SummaryStep({
  draft,
  saving,
  onFinish,
}: {
  draft: Draft;
  saving: boolean;
  onFinish: () => void;
}) {
  const point = draft.workArea?.lat != null ? draft.workArea : draft.location;
  const prayerStopCount = useMemo(() => {
    if (!draft.prayerEnabled || point?.lat == null || point.lng == null) return 0;
    const now = new Date();
    const times = computePrayerTimesISO({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      lat: point.lat,
      lng: point.lng,
      utcOffsetMinutes: -now.getTimezoneOffset(),
      method: draft.method,
      asrMadhab: draft.asrMadhab,
    });
    return schedulePrayerStops(
      times,
      { combineDhuhrAsr: draft.combineDhuhrAsr, combineMaghribIsha: draft.combineMaghribIsha },
      todayIso(draft.hoursStart),
      todayIso(draft.hoursEnd),
    ).length;
  }, [draft, point]);

  return (
    <div className="wizstep">
      <div className="card">
        <div className="cardtitle">Your day</div>
        <div className="wizrecap">
          <div className="wizrecaprow">
            <span className="k">From</span>
            <span className="v">{draft.location?.label ?? "Not set"}</span>
          </div>
          <div className="wizrecaprow">
            <span className="k">Work area</span>
            <span className="v">{draft.workArea?.label ?? "Not set"}</span>
          </div>
          <div className="wizrecaprow">
            <span className="k">Hours</span>
            <span className="v">
              {draft.hoursStart}–{draft.hoursEnd}
            </span>
          </div>
          <div className="wizrecaprow">
            <span className="k">Bag</span>
            <span className="v">{draft.bag ? (draft.locker ? "Yes · locker" : "Yes · carried") : "No"}</span>
          </div>
          <div className="wizrecaprow">
            <span className="k">Prayer stops</span>
            <span className="v">
              {draft.prayerEnabled
                ? `${prayerStopCount} in work hours${draft.mosque ? ` · ${draft.mosque.name}` : ""}`
                : "Not planned"}
            </span>
          </div>
        </div>
      </div>
      <button
        type="button"
        className="primary"
        disabled={saving}
        onClick={onFinish}
        data-testid="wizard-compile"
      >
        {saving ? "Saving…" : "Compile my day"}
      </button>
    </div>
  );
}

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  getAdminRouteStopOptions,
  searchAdminBuses,
  searchAdminGuardians,
  searchAdminRoutes,
  type BusSearchOption,
  type CreateStudentOnboardingInput,
  type GuardianRelationship,
  type GuardianSearchOption,
  type RouteSearchOption,
  type RouteStopOption,
  type StopChoice,
} from '@/services/studentOnboardingService';
import type { School } from '@/types/organization';
import type { RouteType } from '@/types/transportation';

const fieldClassName =
  'mt-2 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-navy-900';
const labelClassName = 'block text-sm font-semibold text-gray-700';

function localDate() {
  const value = new Date();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="rounded-xl border border-gray-200 p-4">
      <legend className="px-2 text-base font-bold text-navy-900">{title}</legend>
      <p className="mb-4 text-sm text-gray-600">{description}</p>
      {children}
    </fieldset>
  );
}

function ModeSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className={labelClassName}>
      {label}
      <select
        className={fieldClassName}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function EntitySearchPicker<T extends { id: string }>({
  label,
  placeholder,
  value,
  selectedLabel,
  search,
  optionLabel,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  selectedLabel: string;
  search: (query: string) => Promise<T[]>;
  optionLabel: (option: T) => string;
  onChange: (id: string, label: string) => void;
}) {
  const [query, setQuery] = useState(selectedLabel);
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    if (value && query === selectedLabel) return;
    if (query.trim().length < 2) {
      setOptions([]);
      setLoading(false);
      setError(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const request = ++sequence.current;
      setLoading(true);
      setError(null);
      void search(query)
        .then((rows) => {
          if (request === sequence.current) setOptions(rows);
        })
        .catch(() => {
          if (request === sequence.current) setError('Search is temporarily unavailable.');
        })
        .finally(() => {
          if (request === sequence.current) setLoading(false);
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, search, selectedLabel, value]);

  return (
    <label className={labelClassName}>
      {label}
      <input
        type="search"
        autoComplete="off"
        className={fieldClassName}
        value={query}
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange('', '');
        }}
      />
      {loading && <span className="mt-1 block text-xs text-gray-500">Searching…</span>}
      {error && <span className="mt-1 block text-xs text-danger-700">{error}</span>}
      {!value && options.length > 0 && (
        <span className="mt-1 block max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {options.map((option) => {
            const text = optionLabel(option);
            return (
              <button
                key={option.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm font-normal hover:bg-gray-50"
                onClick={() => {
                  setQuery(text);
                  setOptions([]);
                  onChange(option.id, text);
                }}
              >
                {text}
              </button>
            );
          })}
        </span>
      )}
    </label>
  );
}

function StopFields({
  kind,
  mode,
  onModeChange,
  existingId,
  onExistingIdChange,
  name,
  onNameChange,
  plannedTime,
  onPlannedTimeChange,
  stops,
  allowExisting,
}: {
  kind: 'Pickup' | 'Drop-off';
  mode: StopChoice['mode'];
  onModeChange: (mode: StopChoice['mode']) => void;
  existingId: string;
  onExistingIdChange: (id: string) => void;
  name: string;
  onNameChange: (name: string) => void;
  plannedTime: string;
  onPlannedTimeChange: (time: string) => void;
  stops: RouteStopOption[];
  allowExisting: boolean;
}) {
  return (
    <div className="rounded-lg bg-gray-50 p-4">
      <ModeSelect
        label={`${kind} stop`}
        value={mode}
        options={[
          { value: 'none', label: 'Not assigned yet' },
          ...(allowExisting ? [{ value: 'existing' as const, label: 'Choose existing stop' }] : []),
          { value: 'new', label: 'Create a stop' },
        ]}
        onChange={onModeChange}
      />
      {mode === 'existing' && (
        <label className={`${labelClassName} mt-3`}>
          Existing {kind.toLowerCase()} stop
          <select
            className={fieldClassName}
            value={existingId}
            onChange={(event) => onExistingIdChange(event.target.value)}
          >
            <option value="">Choose a stop</option>
            {stops.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {stop.stop_order}. {stop.stop_name}
                {stop.planned_arrival_time ? ` (${stop.planned_arrival_time.slice(0, 5)})` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {mode === 'new' && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={labelClassName}>
            Operational stop name
            <input
              className={fieldClassName}
              maxLength={160}
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Example: Community Centre"
            />
          </label>
          <label className={labelClassName}>
            Planned time (optional)
            <input
              className={fieldClassName}
              type="time"
              value={plannedTime}
              onChange={(event) => onPlannedTimeChange(event.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  );
}

export function StudentOnboardingForm({
  schools,
  onSubmit,
  onCancel,
}: {
  schools: School[];
  onSubmit: (input: CreateStudentOnboardingInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [grade, setGrade] = useState('');
  const [schoolId, setSchoolId] = useState('');

  const [guardianMode, setGuardianMode] = useState<'none' | 'existing' | 'new'>('none');
  const [guardianId, setGuardianId] = useState('');
  const [guardianLabel, setGuardianLabel] = useState('');
  const [guardianFirstName, setGuardianFirstName] = useState('');
  const [guardianLastName, setGuardianLastName] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [relationship, setRelationship] = useState<GuardianRelationship>('guardian');

  const [transportationEnabled, setTransportationEnabled] = useState(false);
  const [routeMode, setRouteMode] = useState<'existing' | 'new'>('existing');
  const [routeId, setRouteId] = useState('');
  const [routeLabel, setRouteLabel] = useState('');
  const [routeName, setRouteName] = useState('');
  const [routeCode, setRouteCode] = useState('');
  const [routeType, setRouteType] = useState<RouteType>('morning');
  const [busMode, setBusMode] = useState<'existing' | 'new'>('existing');
  const [busId, setBusId] = useState('');
  const [busLabel, setBusLabel] = useState('');
  const [busNumber, setBusNumber] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [capacity, setCapacity] = useState('');
  const [tripType, setTripType] = useState<'morning' | 'evening'>('morning');
  const [effectiveFrom, setEffectiveFrom] = useState(localDate);

  const [routeStops, setRouteStops] = useState<RouteStopOption[]>([]);
  const [stopsLoading, setStopsLoading] = useState(false);
  const [pickupMode, setPickupMode] = useState<StopChoice['mode']>('none');
  const [pickupStopId, setPickupStopId] = useState('');
  const [pickupStopName, setPickupStopName] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [dropoffMode, setDropoffMode] = useState<StopChoice['mode']>('none');
  const [dropoffStopId, setDropoffStopId] = useState('');
  const [dropoffStopName, setDropoffStopName] = useState('');
  const [dropoffTime, setDropoffTime] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (routeMode !== 'existing' || !routeId) {
      setRouteStops([]);
      setPickupStopId('');
      setDropoffStopId('');
      if (routeMode === 'new') {
        if (pickupMode === 'existing') setPickupMode('new');
        if (dropoffMode === 'existing') setDropoffMode('new');
      }
      return;
    }
    let current = true;
    setStopsLoading(true);
    void getAdminRouteStopOptions(routeId)
      .then((rows) => {
        if (current) setRouteStops(rows);
      })
      .catch(() => {
        if (current) setFormError('Stops for the selected route could not be loaded.');
      })
      .finally(() => {
        if (current) setStopsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [dropoffMode, pickupMode, routeId, routeMode]);

  function stopChoice(
    mode: StopChoice['mode'],
    id: string,
    name: string,
    plannedTime: string,
  ): StopChoice {
    if (mode === 'existing') return { mode, id };
    if (mode === 'new') return { mode, name, plannedTime };
    return { mode: 'none' };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setFormError('Student first name and last name are required.');
      return;
    }
    if (guardianMode === 'existing' && !guardianId) {
      setFormError('Search for and select an existing guardian.');
      return;
    }
    if (
      guardianMode === 'new' &&
      (!guardianFirstName.trim() ||
        !guardianLastName.trim() ||
        !guardianEmail.trim() ||
        !guardianPhone.trim())
    ) {
      setFormError('Guardian first name, last name, email, and phone are required.');
      return;
    }
    if (transportationEnabled) {
      if (routeMode === 'existing' && !routeId) {
        setFormError('Search for and select an existing route.');
        return;
      }
      if (routeMode === 'new' && (!routeName.trim() || !routeCode.trim())) {
        setFormError('Route name and route code are required.');
        return;
      }
      if (busMode === 'existing' && !busId) {
        setFormError('Search for and select an existing bus.');
        return;
      }
      if (busMode === 'new' && !busNumber.trim()) {
        setFormError('Bus number is required.');
        return;
      }
      if (capacity && (!Number.isInteger(Number(capacity)) || Number(capacity) < 0 || Number(capacity) > 200)) {
        setFormError('Bus capacity must be a whole number between 0 and 200.');
        return;
      }
      if (pickupMode === 'existing' && !pickupStopId) {
        setFormError('Choose an existing pickup stop.');
        return;
      }
      if (pickupMode === 'new' && !pickupStopName.trim()) {
        setFormError('Enter an operational pickup stop name.');
        return;
      }
      if (dropoffMode === 'existing' && !dropoffStopId) {
        setFormError('Choose an existing drop-off stop.');
        return;
      }
      if (dropoffMode === 'new' && !dropoffStopName.trim()) {
        setFormError('Enter an operational drop-off stop name.');
        return;
      }
    }

    const guardian =
      guardianMode === 'existing'
        ? ({ mode: 'existing', id: guardianId, relationship } as const)
        : guardianMode === 'new'
          ? ({
              mode: 'new',
              firstName: guardianFirstName,
              lastName: guardianLastName,
              email: guardianEmail,
              phone: guardianPhone,
              relationship,
            } as const)
          : ({ mode: 'none' } as const);

    const transportation: CreateStudentOnboardingInput['transportation'] = transportationEnabled
      ? {
          enabled: true,
          route:
            routeMode === 'existing'
              ? { mode: 'existing' as const, id: routeId }
              : {
                  mode: 'new' as const,
                  name: routeName,
                  code: routeCode,
                  type: routeType,
                },
          bus:
            busMode === 'existing'
              ? { mode: 'existing' as const, id: busId }
              : {
                  mode: 'new' as const,
                  number: busNumber,
                  licensePlate,
                  capacity,
                },
          pickupStop: stopChoice(pickupMode, pickupStopId, pickupStopName, pickupTime),
          dropoffStop: stopChoice(dropoffMode, dropoffStopId, dropoffStopName, dropoffTime),
          tripType,
          effectiveFrom,
        }
      : { enabled: false };

    setSaving(true);
    try {
      await onSubmit({
        student: {
          firstName,
          lastName,
          preferredName,
          grade,
          schoolId,
        },
        guardian,
        transportation,
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to create the student.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
          Tenant admin workflow
        </p>
        <h2 className="mt-1 text-xl font-bold text-navy-900">Add student and transportation</h2>
        <p className="mt-1 text-sm text-gray-600">
          Create the student, link or invite a guardian, and configure their bus service in one secure workflow.
        </p>
      </div>

      <form className="mt-5 grid gap-5" onSubmit={handleSubmit}>
        {formError && (
          <p className="rounded-lg bg-danger-50 p-3 text-sm font-semibold text-danger-700">
            {formError}
          </p>
        )}

        <Section
          title="1. Student"
          description="Only transportation roster details are collected. Do not enter a home address, health data, or Alberta Student Number."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className={labelClassName}>
              First name
              <input className={fieldClassName} maxLength={100} value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            </label>
            <label className={labelClassName}>
              Last name
              <input className={fieldClassName} maxLength={100} value={lastName} onChange={(event) => setLastName(event.target.value)} />
            </label>
            <label className={labelClassName}>
              Preferred name (optional)
              <input className={fieldClassName} maxLength={100} value={preferredName} onChange={(event) => setPreferredName(event.target.value)} />
            </label>
            <label className={labelClassName}>
              Grade (optional)
              <input className={fieldClassName} maxLength={40} value={grade} onChange={(event) => setGrade(event.target.value)} />
            </label>
            <label className={labelClassName}>
              School (optional)
              <select className={fieldClassName} value={schoolId} onChange={(event) => setSchoolId(event.target.value)}>
                <option value="">No school</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Section>

        <Section
          title="2. Guardian"
          description="Select an existing guardian or send a one-time account invitation. Guardians only see students explicitly linked to them."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <ModeSelect
              label="Guardian option"
              value={guardianMode}
              options={[
                { value: 'none', label: 'Link later' },
                { value: 'existing', label: 'Choose existing guardian' },
                { value: 'new', label: 'Invite new guardian' },
              ]}
              onChange={setGuardianMode}
            />
            {guardianMode !== 'none' && (
              <ModeSelect
                label="Relationship"
                value={relationship}
                options={[
                  { value: 'guardian', label: 'Guardian' },
                  { value: 'mother', label: 'Mother' },
                  { value: 'father', label: 'Father' },
                  { value: 'caregiver', label: 'Caregiver' },
                  { value: 'other', label: 'Other' },
                ]}
                onChange={setRelationship}
              />
            )}
          </div>
          {guardianMode === 'existing' && (
            <div className="mt-4">
              <EntitySearchPicker<GuardianSearchOption>
                label="Search guardian by name or email"
                placeholder="Start typing a name or email"
                value={guardianId}
                selectedLabel={guardianLabel}
                search={searchAdminGuardians}
                optionLabel={(option) => `${option.full_name} — ${option.email}`}
                onChange={(id, label) => {
                  setGuardianId(id);
                  setGuardianLabel(label);
                }}
              />
            </div>
          )}
          {guardianMode === 'new' && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className={labelClassName}>
                Guardian first name
                <input className={fieldClassName} maxLength={100} value={guardianFirstName} onChange={(event) => setGuardianFirstName(event.target.value)} required />
              </label>
              <label className={labelClassName}>
                Guardian last name
                <input className={fieldClassName} maxLength={100} value={guardianLastName} onChange={(event) => setGuardianLastName(event.target.value)} required />
              </label>
              <label className={labelClassName}>
                Guardian email
                <input className={fieldClassName} type="email" maxLength={320} value={guardianEmail} onChange={(event) => setGuardianEmail(event.target.value)} required />
              </label>
              <label className={labelClassName}>
                Phone
                <input className={fieldClassName} type="tel" maxLength={40} value={guardianPhone} onChange={(event) => setGuardianPhone(event.target.value)} required />
              </label>
              <p className="self-end rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
                SafeBus sends the guardian a secure link to create or activate their account. No password is handled by the admin.
              </p>
            </div>
          )}
        </Section>

        <Section
          title="3. Bus, route, and stops"
          description="Transportation is optional. Existing records are searched within your tenant; new records are created together with the student."
        >
          <label className="flex items-start gap-3 text-sm font-semibold text-gray-700">
            <input
              className="mt-1 h-4 w-4"
              type="checkbox"
              checked={transportationEnabled}
              onChange={(event) => setTransportationEnabled(event.target.checked)}
            />
            Assign transportation now
          </label>

          {transportationEnabled && (
            <div className="mt-4 grid gap-5">
              <div className="grid gap-4 md:grid-cols-2">
                <ModeSelect
                  label="Route option"
                  value={routeMode}
                  options={[
                    { value: 'existing', label: 'Choose existing route' },
                    { value: 'new', label: 'Create route' },
                  ]}
                  onChange={setRouteMode}
                />
                <ModeSelect
                  label="Bus option"
                  value={busMode}
                  options={[
                    { value: 'existing', label: 'Choose existing bus' },
                    { value: 'new', label: 'Create bus' },
                  ]}
                  onChange={setBusMode}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {routeMode === 'existing' ? (
                  <EntitySearchPicker<RouteSearchOption>
                    label="Search route by name or code"
                    placeholder="Start typing a route name or code"
                    value={routeId}
                    selectedLabel={routeLabel}
                    search={searchAdminRoutes}
                    optionLabel={(option) => `${option.route_code} — ${option.route_name}`}
                    onChange={(id, label) => {
                      setRouteId(id);
                      setRouteLabel(label);
                    }}
                  />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 md:col-span-1">
                    <label className={labelClassName}>
                      Route name
                      <input className={fieldClassName} maxLength={160} value={routeName} onChange={(event) => setRouteName(event.target.value)} />
                    </label>
                    <label className={labelClassName}>
                      Route code
                      <input className={fieldClassName} maxLength={40} value={routeCode} onChange={(event) => setRouteCode(event.target.value)} />
                    </label>
                    <ModeSelect
                      label="Route type"
                      value={routeType}
                      options={[
                        { value: 'morning', label: 'Morning' },
                        { value: 'afternoon', label: 'Afternoon' },
                        { value: 'special', label: 'Special' },
                      ]}
                      onChange={setRouteType}
                    />
                  </div>
                )}

                {busMode === 'existing' ? (
                  <EntitySearchPicker<BusSearchOption>
                    label="Search bus by number"
                    placeholder="Start typing a bus number"
                    value={busId}
                    selectedLabel={busLabel}
                    search={searchAdminBuses}
                    optionLabel={(option) => `Bus ${option.bus_number}${option.license_plate ? ` — ${option.license_plate}` : ''}`}
                    onChange={(id, label) => {
                      setBusId(id);
                      setBusLabel(label);
                    }}
                  />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 md:col-span-1">
                    <label className={labelClassName}>
                      Bus number
                      <input className={fieldClassName} maxLength={40} value={busNumber} onChange={(event) => setBusNumber(event.target.value)} />
                    </label>
                    <label className={labelClassName}>
                      License plate (optional)
                      <input className={fieldClassName} maxLength={40} value={licensePlate} onChange={(event) => setLicensePlate(event.target.value)} />
                    </label>
                    <label className={labelClassName}>
                      Capacity (optional)
                      <input className={fieldClassName} type="number" min="0" max="200" value={capacity} onChange={(event) => setCapacity(event.target.value)} />
                    </label>
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ModeSelect
                  label="Bus service"
                  value={tripType}
                  options={[
                    { value: 'morning', label: 'Morning service' },
                    { value: 'evening', label: 'Evening service' },
                  ]}
                  onChange={setTripType}
                />
                <label className={labelClassName}>
                  Effective from
                  <input className={fieldClassName} type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
                </label>
              </div>

              {stopsLoading && <p className="text-sm text-gray-500">Loading route stops…</p>}
              <div className="grid gap-4 md:grid-cols-2">
                <StopFields
                  kind="Pickup"
                  mode={pickupMode}
                  onModeChange={setPickupMode}
                  existingId={pickupStopId}
                  onExistingIdChange={setPickupStopId}
                  name={pickupStopName}
                  onNameChange={setPickupStopName}
                  plannedTime={pickupTime}
                  onPlannedTimeChange={setPickupTime}
                  stops={routeStops}
                  allowExisting={routeMode === 'existing'}
                />
                <StopFields
                  kind="Drop-off"
                  mode={dropoffMode}
                  onModeChange={setDropoffMode}
                  existingId={dropoffStopId}
                  onExistingIdChange={setDropoffStopId}
                  name={dropoffStopName}
                  onNameChange={setDropoffStopName}
                  plannedTime={dropoffTime}
                  onPlannedTimeChange={setDropoffTime}
                  stops={routeStops}
                  allowExisting={routeMode === 'existing'}
                />
              </div>
              {(pickupMode === 'new' || dropoffMode === 'new') && (
                <p className="rounded-lg bg-warning-50 p-3 text-sm font-semibold text-warning-900">
                  Use a shared operational stop label such as an intersection, school, or community location. Do not enter a student home address.
                </p>
              )}
            </div>
          )}
        </Section>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="submit" disabled={saving}>
            {saving ? 'Creating student…' : 'Create student'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

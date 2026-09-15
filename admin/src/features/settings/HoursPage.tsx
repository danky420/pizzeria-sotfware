import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { hoursApi } from "../../api/locations";
import {
  ErrorNotice,
  Loading,
  PageHeader,
  Panel,
  type BusinessHoursDay
} from "@chesare/portal-shared";
import { SuccessNotice } from "../../components/ui";
import { minutesToLabel } from "../../lib/format";
import { useLocationId } from "../../state/location";

// Index 0 is Sunday, matching the HORAS array on the customer site and the
// dayOfWeek column in the database.
const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const MINUTES_IN_DAY = 24 * 60;

const SLOTS: number[] = [];
for (let minute = 0; minute <= MINUTES_IN_DAY; minute += 30) SLOTS.push(minute);

function slotLabel(minutes: number): string {
  if (minutes === MINUTES_IN_DAY) return "24:00 (medianoche)";
  return minutesToLabel(minutes);
}

function emptyWeek(): BusinessHoursDay[] {
  return DAY_NAMES.map((_, dayOfWeek) => ({ dayOfWeek, opensAt: null, closesAt: null }));
}

function mergeWeek(days: BusinessHoursDay[]): BusinessHoursDay[] {
  const week = emptyWeek();
  for (const day of days) {
    if (day.dayOfWeek >= 0 && day.dayOfWeek < week.length) {
      week[day.dayOfWeek] = { ...day };
    }
  }
  return week;
}

export function HoursPage() {
  const locationId = useLocationId();
  const queryClient = useQueryClient();
  const [week, setWeek] = useState<BusinessHoursDay[]>(emptyWeek);
  const [invalid, setInvalid] = useState<string | null>(null);

  const hours = useQuery({
    queryKey: ["hours", locationId],
    queryFn: () => hoursApi.list(locationId).then((response) => response.days)
  });

  useEffect(() => {
    if (hours.data) setWeek(mergeWeek(hours.data));
  }, [hours.data]);

  const save = useMutation({
    mutationFn: (days: BusinessHoursDay[]) => hoursApi.replace(locationId, days),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["hours", locationId] })
  });

  const updateDay = (dayOfWeek: number, patch: Partial<BusinessHoursDay>) =>
    setWeek((current) =>
      current.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day))
    );

  const onSave = () => {
    for (const day of week) {
      const closed = day.opensAt === null && day.closesAt === null;
      if (closed) continue;
      if (day.opensAt === null || day.closesAt === null) {
        setInvalid(`${DAY_NAMES[day.dayOfWeek]}: falta la hora de apertura o de cierre.`);
        return;
      }
      if (day.closesAt <= day.opensAt) {
        setInvalid(`${DAY_NAMES[day.dayOfWeek]}: el cierre debe ser después de la apertura.`);
        return;
      }
    }
    setInvalid(null);
    save.mutate(week);
  };

  if (hours.isPending) return <Loading label="Cargando horarios…" />;

  return (
    <>
      <PageHeader
        title="Horarios"
        description="Estos horarios deciden si la página se ve abierta o cerrada."
      />

      <Panel>
        <ErrorNotice error={hours.error} title="No se pudieron cargar los horarios" />

        <div className="table-wrap">
          <table className="hours-grid">
            <thead>
              <tr>
                <th>Día</th>
                <th>Abre</th>
                <th>Cierra</th>
                <th>Cerrado</th>
              </tr>
            </thead>
            <tbody>
              {week.map((day) => {
                const closed = day.opensAt === null && day.closesAt === null;
                return (
                  <tr key={day.dayOfWeek}>
                    <td>{DAY_NAMES[day.dayOfWeek]}</td>
                    <td>
                      <select
                        aria-label={`Hora de apertura, ${DAY_NAMES[day.dayOfWeek]}`}
                        disabled={closed}
                        value={day.opensAt ?? ""}
                        onChange={(event) =>
                          updateDay(day.dayOfWeek, { opensAt: Number(event.target.value) })
                        }
                      >
                        <option value="">—</option>
                        {SLOTS.map((minutes) => (
                          <option key={minutes} value={minutes}>
                            {slotLabel(minutes)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label={`Hora de cierre, ${DAY_NAMES[day.dayOfWeek]}`}
                        disabled={closed}
                        value={day.closesAt ?? ""}
                        onChange={(event) =>
                          updateDay(day.dayOfWeek, { closesAt: Number(event.target.value) })
                        }
                      >
                        <option value="">—</option>
                        {SLOTS.map((minutes) => (
                          <option key={minutes} value={minutes}>
                            {slotLabel(minutes)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={closed}
                          onChange={(event) =>
                            updateDay(
                              day.dayOfWeek,
                              event.target.checked
                                ? { opensAt: null, closesAt: null }
                                : { opensAt: 18 * 60, closesAt: MINUTES_IN_DAY }
                            )
                          }
                        />
                        <span>Cerrado</span>
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {invalid ? <p className="notice notice-error">{invalid}</p> : null}
        {save.isSuccess && !save.isPending ? <SuccessNotice>Horarios guardados.</SuccessNotice> : null}
        <ErrorNotice error={save.error} title="No se pudieron guardar los horarios" />

        <div className="row">
          <button type="button" className="btn btn-primary" disabled={save.isPending} onClick={onSave}>
            {save.isPending ? "Guardando…" : "Guardar horarios"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => hours.data && setWeek(mergeWeek(hours.data))}
          >
            Descartar cambios
          </button>
        </div>
      </Panel>
    </>
  );
}

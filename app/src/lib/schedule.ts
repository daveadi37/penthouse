/* ============================================================
   The schedule engine — ported from the original build, then
   extended with zones, staff roles and clock times.

   In production this becomes a Postgres `build_day(date)` run by
   pg_cron at 05:00, so the day exists before anyone opens the app
   and push can fire against it. The signature here is deliberately
   pure: same inputs, same day, wherever it runs.
   ============================================================ */

import type {
  Absence,
  Area,
  RoleDef,
  CoverageRule,
  DateStr,
  Guest,
  HouseEvent,
  ID,
  LibraryTask,
  Meal,
  OccasionTask,
  Plant,
  Profile,
  ServiceContract,
  Settings,
  Shift,
  StaffRole,
  TaskCategory,
  TaskInstance,
  TaskOffset,
  TimeStr,
  Vacation,
  Zone,
} from '@/types';
import { addDays, diffDays, parityOf, pd, toMinutes } from './date';
import { uid } from './id';

/* ---------- recurrence ---------- */

export function dueOn(t: LibraryTask, area: Area | null, date: DateStr, s: Settings): boolean {
  const d = pd(date);
  const dow = d.getDay();
  const dom = d.getDate();
  switch (t.freq) {
    case 'daily':
      return true;
    case 'weekdays':
      return s.workingWeek.days.includes(dow);
    case 'weekly':
      return dow === Number(t.dow);
    case 'fortnightly':
      return dow === Number(t.dow) && parityOf(date, s.parityEpoch) === t.parity;
    case 'monthly':
      return dow === Number(t.dow) && dom <= 7;
    case 'areaDeep': {
      if (!area || !area.deepFreq) return false;
      if (dow !== area.deepDow) return false;
      if (area.deepFreq === 7) return true;
      if (area.deepFreq === 14) return parityOf(date, s.parityEpoch) === area.parity;
      return dom <= 7;
    }
    default:
      return false;
  }
}

export function areasFor(t: LibraryTask, areas: Area[]): (Area | null)[] {
  const live = areas.filter((a) => a.active);
  switch (t.apply) {
    case 'area':
      return live.filter((a) => a.id === t.areaId);
    case 'areaType':
      return live.filter(
        (a) => a.type === t.areaType && (t.zone === 'any' || a.zone === t.zone),
      );
    case 'zone':
      return live.filter((a) => t.zone === 'any' || a.zone === t.zone);
    case 'global':
    default:
      return [null];
  }
}

export function freqLabel(t: LibraryTask, dowNames: string[]): string {
  switch (t.freq) {
    case 'daily':
      return 'Every day';
    case 'weekdays':
      return 'Working days';
    case 'weekly':
      return `Every ${dowNames[t.dow]}`;
    case 'fortnightly':
      return `Fortnightly on ${dowNames[t.dow]}`;
    case 'monthly':
      return `Monthly · first ${dowNames[t.dow]}`;
    case 'areaDeep':
      return "On the area's deep-clean cycle";
    default:
      return t.freq;
  }
}

/* ---------- who is working ---------- */

export function isAbsent(staffId: ID, date: DateStr, absences: Absence[]): Absence | undefined {
  return absences.find((a) => a.staffId === staffId && date >= a.from && date <= a.to);
}

export function isWorking(
  staffId: ID,
  date: DateStr,
  shifts: Shift[],
  absences: Absence[],
): boolean {
  if (isAbsent(staffId, date, absences)) return false;
  const shift = shifts.find((s) => s.staffId === staffId);
  if (!shift) return false;
  return shift.days.includes(pd(date).getDay());
}

/**
 * There is one zone now, so a library task's role is simply its role.
 * The indirection stays because routing goes through one place, and the
 * day this house has a second premises again it will go through here.
 */
export function effectiveRole(role: StaffRole, _zone: Zone): StaffRole {
  return role;
}

export interface RoutingContext {
  profiles: Profile[];
  /** The role definitions, so 'who is staff' is read from the hierarchy. */
  roles: RoleDef[];
  shifts: Shift[];
  absences: Absence[];
  coverage: CoverageRule[];
}

/** Stable across days: the same task lands on the same person. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Is this person on shift at that clock time? */
function onShiftAt(staffId: ID, at: TimeStr | undefined, shifts: Shift[]): boolean {
  if (!at) return true;
  const shift = shifts.find((s) => s.staffId === staffId);
  if (!shift) return false;
  const m = toMinutes(at);
  return m >= toMinutes(shift.start) && m <= toMinutes(shift.end);
}

/**
 * Auto-routing, in four steps: whoever holds the role, is working, and
 * is actually on shift at the hour the task wants; then the coverage
 * rule; then anyone working; then nobody, which surfaces as a gap.
 *
 * Two details earn their keep. The shift window matters because Reza
 * starts at 14:00 — routing him a 07:00 task reads as assigned and is
 * not. And where several people hold the role, the task id picks
 * between them rather than the first one always winning: without that,
 * Rosie collects every housekeeping task in the house and Reza shows
 * zero, which is exactly the day this app is meant to prevent.
 */
export function routeTo(
  role: StaffRole,
  zone: Zone,
  date: DateStr,
  ctx: RoutingContext,
  taskKey = '',
  at?: TimeStr,
): ID | undefined {
  const works = new Set(ctx.roles.filter((r) => r.works).map((r) => r.id));
  const staff = ctx.profiles.filter((p) => p.active && works.has(p.role));

  const holders = staff.filter(
    (p) =>
      (p.staffRoles.includes(role) || p.staffRoles.includes('any')) &&
      isWorking(p.id, date, ctx.shifts, ctx.absences),
  );
  const onShift = holders.filter((p) => onShiftAt(p.id, at, ctx.shifts));
  const pool = onShift.length ? onShift : holders;
  if (pool.length) return pool[hash(taskKey || role) % pool.length]!.id;

  const rule = ctx.coverage.find(
    (c) => c.role === role && (c.zone === 'any' || c.zone === zone),
  );
  if (rule && isWorking(rule.coverStaffId, date, ctx.shifts, ctx.absences)) {
    return rule.coverStaffId;
  }

  const anyone = staff.filter((p) => isWorking(p.id, date, ctx.shifts, ctx.absences));
  return anyone.length ? anyone[hash(taskKey || role) % anyone.length]!.id : undefined;
}

export interface CoverageGap {
  role: StaffRole;
  zone: Zone;
  count: number;
}

/** Roles with work scheduled today and nobody to do it. */
export function coverageGaps(tasks: TaskInstance[]): CoverageGap[] {
  const map = new Map<string, CoverageGap>();
  tasks
    .filter((t) => !t.assignedTo && !t.done)
    .forEach((t) => {
      const key = `${t.role}|${t.zone}`;
      const existing = map.get(key);
      if (existing) existing.count++;
      else map.set(key, { role: t.role, zone: t.zone, count: 1 });
    });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/* ---------- occasion offsets ---------- */

export function dueDateFor(offset: TaskOffset, anchor: DateStr): DateStr {
  if (offset.unit !== 'days') return anchor;
  return addDays(anchor, (offset.dir === 'after' ? 1 : -1) * Number(offset.n || 0));
}

export function offsetLabel(o: TaskOffset): string {
  const n = Number(o.n || 0);
  if (!n) return o.dir === 'after' ? 'On the day, after' : 'On the day';
  const unit =
    o.unit === 'hours' ? (n === 1 ? 'hour' : 'hours')
    : o.unit === 'minutes' ? (n === 1 ? 'minute' : 'minutes')
    : n === 1 ? 'day' : 'days';
  return `${n} ${unit} ${o.dir}`;
}

export function offsetWeight(o: TaskOffset): number {
  const per = o.unit === 'minutes' ? 1 : o.unit === 'hours' ? 60 : 1440;
  return -(Number(o.n || 0) * per * (o.dir === 'after' ? -1 : 1));
}

export function sortByOffset<T extends { offset: TaskOffset; order: number }>(tasks: T[]): T[] {
  return tasks
    .slice()
    .sort((a, b) => offsetWeight(a.offset) - offsetWeight(b.offset) || a.order - b.order);
}

/* ---------- the day builder ---------- */

export interface BuildInput {
  date: DateStr;
  settings: Settings;
  areas: Area[];
  categories: TaskCategory[];
  library: LibraryTask[];
  meals: Meal[];
  guests: Guest[];
  events: HouseEvent[];
  vacations: Vacation[];
  plants: Plant[];
  contracts: ServiceContract[];
  routing: RoutingContext;
}

function make(partial: Partial<TaskInstance> & { title: string; categoryId: ID }): TaskInstance {
  return {
    id: uid('ti'),
    date: '',
    zone: 'household',
    role: 'any',
    estMinutes: 10,
    done: false,
    source: 'library',
    order: 0,
    ...partial,
  } as TaskInstance;
}

export function buildDay(input: BuildInput): TaskInstance[] {
  const { date, settings, areas, library, routing } = input;
  const dow = pd(date).getDay();
  const out: TaskInstance[] = [];
  const catOrder = new Map(input.categories.map((c) => [c.id, c.order]));

  /* --- 1. library tasks × areas --- */
  library
    .filter((t) => t.active)
    .forEach((t) => {
      areasFor(t, areas).forEach((area) => {
        if (!dueOn(t, area, date, settings)) return;

        // Unused bedrooms run only the light tasks, and only on set days.
        if (area?.status === 'unused' && !t.light && !settings.unusedDows.includes(dow)) return;

        const zone: Zone = area ? area.zone : 'household';
        const role = effectiveRole(t.role, zone);

        out.push(
          make({
            date,
            libraryId: t.id,
            categoryId: t.categoryId,
            title: area ? `${t.text} — ${area.name}` : t.text,
            instructions: t.instructions,
            areaId: area?.id,
            areaName: area?.name,
            zone,
            role,
            assignedTo: routeTo(role, zone, date, routing, t.id, t.defaultTime),
            scheduledAt: t.defaultTime,
            estMinutes: t.estMinutes,
            groupAs: t.groupAs || area?.name || '',
            source: 'library',
            sourceRef: t.id,
            order: (catOrder.get(t.categoryId) ?? 50) * 1000 + t.order,
          }),
        );
      });
    });

  /* --- 2. meals become cooking tasks at their serve time --- */
  const cookingCat = input.categories.find((c) => c.system === 'cooking');
  if (cookingCat) {
    input.meals
      .filter((m) => m.date === date && m.status !== 'Draft')
      .forEach((m, i) => {
        const zone = m.zone;
        out.push(
          make({
            date,
            categoryId: cookingCat.id,
            title: `${m.type}: ${m.name}`,
            instructions: [m.prep, m.cook, m.diet].filter(Boolean).join(' · '),
            zone,
            role: 'cooking',
            assignedTo: routeTo('cooking', zone, date, routing),
            scheduledAt: m.serveAt,
            estMinutes: 60,
            groupAs: 'Meals',
            source: 'meal',
            sourceRef: m.id,
            order: (catOrder.get(cookingCat.id) ?? 50) * 1000 + i,
          }),
        );
      });
  }

  /* --- 3. laundry rota --- */
  const laundryCat = input.categories.find((c) => c.system === 'laundry');
  if (laundryCat) {
    (settings.laundry[dow] || []).forEach((slot, i) => {
      settings.laundryStages.forEach((stage, j) => {
        out.push(
          make({
            date,
            categoryId: laundryCat.id,
            title: `${stage} — ${slot.person} · ${slot.type}`,
            zone: 'household',
            role: 'housekeeping',
            assignedTo: routeTo('housekeeping', 'household', date, routing),
            estMinutes: 15,
            groupAs: `${slot.person} · ${slot.type}`,
            source: 'laundry',
            sourceRef: `${dow}:${i}:${stage}`,
            order: (catOrder.get(laundryCat.id) ?? 50) * 1000 + i * 10 + j,
          }),
        );
      });
    });
  }

  /* --- 4. guest and event tasks landing on this date --- */
  const occasionCat = input.categories.find((c) => c.system === 'occasion');
  if (occasionCat) {
    const addOccasion = (
      tasks: OccasionTask[],
      anchor: DateStr,
      label: string,
      refPrefix: string,
      zone: Zone,
    ) => {
      tasks.forEach((ot, i) => {
        if (dueDateFor(ot.offset, anchor) !== date) return;
        out.push(
          make({
            date,
            categoryId: occasionCat.id,
            title: ot.text,
            zone,
            role: ot.role,
            assignedTo: routeTo(ot.role, zone, date, routing),
            estMinutes: ot.estMinutes,
            groupAs: label,
            done: ot.done,
            doneBy: ot.doneBy,
            doneAt: ot.doneAt,
            source: 'occasion',
            sourceRef: `${refPrefix}|${ot.id}`,
            order: (catOrder.get(occasionCat.id) ?? 50) * 1000 + i,
          }),
        );
      });
    };

    input.guests
      .filter((g) => g.status === 'planned' || g.status === 'active')
      .forEach((g) => addOccasion(g.tasks, g.arrival, `Guest · ${g.name}`, `guest:${g.id}`, 'household'));

    input.events
      .filter((e) => e.status === 'planned' || e.status === 'active')
      .forEach((e) => addOccasion(e.tasks, e.date, `Event · ${e.name}`, `event:${e.id}`, e.zone));

    input.vacations
      .filter((v) => v.status === 'planned' || v.status === 'active')
      .forEach((v) => {
        addOccasion(v.preTasks, v.depart, 'Vacation · before', `vac:${v.id}:pre`, 'household');
        addOccasion(v.postTasks, v.return, 'Vacation · on return', `vac:${v.id}:post`, 'household');
        if (date >= v.depart && date <= v.return) {
          v.duringTasks.forEach((ot, i) => {
            out.push(
              make({
                date,
                categoryId: occasionCat.id,
                title: ot.text,
                zone: 'household',
                role: ot.role,
                assignedTo: routeTo(ot.role, 'household', date, routing),
                estMinutes: ot.estMinutes,
                groupAs: 'Vacation · house checks',
                source: 'occasion',
                sourceRef: `vac:${v.id}:during|${ot.id}`,
                order: (catOrder.get(occasionCat.id) ?? 50) * 1000 + 500 + i,
              }),
            );
          });
        }
      });
  }

  /* --- 5. plant care --- */
  const plantCat = input.categories.find((c) => c.system === 'plants');
  if (plantCat) {
    input.plants
      .filter((p) => p.active)
      .forEach((p, i) => {
        const area = areas.find((a) => a.id === p.areaId);
        if (p.waterFreqDays && diffDays(p.waterLast, date) >= p.waterFreqDays) {
          out.push(
            make({
              date,
              categoryId: plantCat.id,
              title: `Water ${p.name}`,
              instructions: p.care,
              areaId: p.areaId,
              areaName: area?.name,
              zone: p.zone,
              role: 'housekeeping',
              assignedTo: routeTo('housekeeping', p.zone, date, routing),
              estMinutes: 5,
              groupAs: 'Plants',
              source: 'plant',
              sourceRef: p.id,
              order: (catOrder.get(plantCat.id) ?? 50) * 1000 + i,
            }),
          );
        }
        if (p.feedFreqDays && diffDays(p.feedLast, date) >= p.feedFreqDays) {
          out.push(
            make({
              date,
              categoryId: plantCat.id,
              title: `Feed ${p.name}`,
              areaId: p.areaId,
              areaName: area?.name,
              zone: p.zone,
              role: 'housekeeping',
              assignedTo: routeTo('housekeeping', p.zone, date, routing),
              estMinutes: 5,
              groupAs: 'Plants',
              source: 'plant',
              sourceRef: p.id + ':feed',
              order: (catOrder.get(plantCat.id) ?? 50) * 1000 + 500 + i,
            }),
          );
        }
      });
  }

  /* --- 6. service contract visits due today --- */
  const contractCat = input.categories.find((c) => c.system === 'contracts');
  if (contractCat) {
    input.contracts
      .filter((c) => c.active && c.next === date)
      .forEach((c, i) => {
        out.push(
          make({
            date,
            categoryId: contractCat.id,
            title: `${c.name} — service visit due`,
            instructions: c.notes,
            areaId: c.areaId,
            zone: c.zone,
            role: 'any',
            assignedTo: routeTo('any', c.zone, date, routing),
            estMinutes: 30,
            groupAs: 'Service visits',
            source: 'contract',
            sourceRef: c.id,
            order: (catOrder.get(contractCat.id) ?? 50) * 1000 + i,
          }),
        );
      });
  }

  /* --- 7. mark anything routed to an absent person as off --- */
  out.forEach((t) => {
    if (t.assignedTo && isAbsent(t.assignedTo, date, routing.absences)) t.off = true;
  });

  return out.sort(
    (a, b) =>
      a.order - b.order ||
      (a.scheduledAt ? toMinutes(a.scheduledAt) : 9999) -
        (b.scheduledAt ? toMinutes(b.scheduledAt) : 9999) ||
      a.title.localeCompare(b.title),
  );
}

/**
 * Rebuild a day while preserving anything a human already did to it.
 * Ticks, notes, manual reassignment and manual times all survive.
 */
export function rebuildDay(existing: TaskInstance[], input: BuildInput): TaskInstance[] {
  const fresh = buildDay(input);
  const byRef = new Map(existing.map((t) => [`${t.source}|${t.sourceRef}|${t.title}`, t]));
  fresh.forEach((t) => {
    const old = byRef.get(`${t.source}|${t.sourceRef}|${t.title}`);
    if (!old) return;
    t.id = old.id;
    t.done = old.done;
    t.doneBy = old.doneBy;
    t.doneAt = old.doneAt;
    t.note = old.note;
    if (old.assignedTo) t.assignedTo = old.assignedTo;
    if (old.scheduledAt) t.scheduledAt = old.scheduledAt;
  });
  // Ad-hoc tasks are not derivable from the library, so carry them across.
  existing.filter((t) => t.source === 'adhoc').forEach((t) => fresh.push(t));
  return fresh;
}

/* ---------- progress ---------- */

export interface Progress {
  done: number;
  total: number;
  pct: number;
}

export function progress(tasks: TaskInstance[]): Progress {
  const live = tasks.filter((t) => !t.off);
  const done = live.filter((t) => t.done).length;
  return {
    done,
    total: live.length,
    pct: live.length ? Math.round((done / live.length) * 100) : 0,
  };
}

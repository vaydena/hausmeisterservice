'use client';

import { useActionState, useMemo, useState } from 'react';
import { LinkButton, Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';
import {
  MODULES,
  type ModuleDomain,
  type ModuleKey,
} from '@/lib/modules/registry';
import { permissionsForModule } from '@/lib/permissions/registry';
import type { RoleFormState } from '../actions';

type ActionType = (prev: RoleFormState, form: FormData) => Promise<RoleFormState>;

type Props = {
  action: ActionType;
  cancelHref: string;
  submitLabel: string;
  initial?: {
    name?: string | null;
    description?: string | null;
    permissions?: string[];
  };
};

const DOMAIN_LABEL: Record<ModuleDomain, string> = {
  core: 'Kern',
  objects: 'Objekte',
  people: 'Personen',
  tasks: 'Aufgaben',
  field: 'Einsatz',
  resources: 'Ressourcen',
  communication: 'Kommunikation',
  finance: 'Finanzen',
  platform: 'Plattform',
};

const DOMAIN_ORDER: ModuleDomain[] = [
  'core',
  'objects',
  'people',
  'tasks',
  'field',
  'resources',
  'communication',
  'finance',
  'platform',
];

export function RoleForm({ action, cancelHref, submitLabel, initial }: Props) {
  const [state, formAction, pending] = useActionState<RoleFormState, FormData>(action, {});
  const initialSet = useMemo(() => new Set(initial?.permissions ?? []), [initial?.permissions]);
  const [selected, setSelected] = useState<Set<string>>(initialSet);

  const grouped = useMemo(() => {
    return DOMAIN_ORDER.map((domain) => ({
      domain,
      modules: MODULES.filter((m) => m.domain === domain).map((m) => ({
        key: m.key,
        label: m.labelDe,
        permissions: permissionsForModule(m.key),
      })).filter((m) => m.permissions.length > 0),
    })).filter((g) => g.modules.length > 0);
  }, []);

  function toggle(permKey: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(permKey)) next.delete(permKey);
      else next.add(permKey);
      return next;
    });
  }

  function selectAllForModule(moduleKey: ModuleKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const perm of permissionsForModule(moduleKey)) next.add(perm.key);
      return next;
    });
  }

  function clearModule(moduleKey: ModuleKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const perm of permissionsForModule(moduleKey)) next.delete(perm.key);
      return next;
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error && (
        <div className="rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-4 py-3 text-sm text-[var(--color-destructive)]">
          {state.error}
        </div>
      )}

      <div className="grid gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 md:grid-cols-2">
        <Field label="Name" error={state.fieldErrors?.name}>
          <Input
            name="name"
            required
            defaultValue={initial?.name ?? ''}
            placeholder="z. B. Objektleiter Nord"
          />
        </Field>
        <Field label="Beschreibung" hint="Optional." error={state.fieldErrors?.description}>
          <Textarea
            name="description"
            defaultValue={initial?.description ?? ''}
            rows={3}
            placeholder="Wofür ist diese Rolle zuständig?"
          />
        </Field>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Rechte
          </h2>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {selected.size} ausgewählt
          </span>
        </div>

        {selected.size > 0 &&
          Array.from(selected).map((key) => (
            <input key={key} type="hidden" name="permissions" value={key} />
          ))}

        <div className="flex flex-col gap-4">
          {grouped.map((group) => (
            <section
              key={group.domain}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5"
            >
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
                {DOMAIN_LABEL[group.domain]}
              </h3>
              <div className="flex flex-col gap-4">
                {group.modules.map((mod) => {
                  const total = mod.permissions.length;
                  const active = mod.permissions.filter((p) => selected.has(p.key)).length;
                  return (
                    <div key={mod.key} className="rounded-lg border border-[var(--color-border)] p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{mod.label}</div>
                        <div className="flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
                          <span>
                            {active} / {total}
                          </span>
                          <button
                            type="button"
                            className="text-[var(--color-primary)] hover:underline"
                            onClick={() => selectAllForModule(mod.key)}
                          >
                            Alle
                          </button>
                          <button
                            type="button"
                            className="hover:underline"
                            onClick={() => clearModule(mod.key)}
                          >
                            Keine
                          </button>
                        </div>
                      </div>
                      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                        {mod.permissions.map((perm) => {
                          const on = selected.has(perm.key);
                          return (
                            <li key={perm.key}>
                              <label className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--color-muted)]">
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => toggle(perm.key)}
                                  className="mt-0.5"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium">{perm.labelDe}</div>
                                  <div className="text-xs text-[var(--color-muted-foreground)]">
                                    {perm.description}
                                  </div>
                                </div>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <LinkButton variant="ghost" href={cancelHref}>
          Abbrechen
        </LinkButton>
        <Button type="submit" disabled={pending}>
          {pending ? 'Speichere …' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

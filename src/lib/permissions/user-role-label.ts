/**
 * Sprint 122: Wer bin ich hier eigentlich?
 *
 * Die Anwendung hat mehrere Nutzerklassen, die sich in verschiedenen
 * Bereichen bewegen — Mitarbeiter im Staff-Bereich, Bewohner im Portal,
 * spaeter Eigentuemer und Hausverwaltungen. Bisher stand nirgends in der
 * Oberflaeche, als was man angemeldet ist. Das faellt genau dann auf, wenn
 * es teuer wird: Wer mehrere Zugaenge hat, meldet sich im falschen an und
 * wundert sich, warum die Haelfte fehlt.
 *
 * Bewusst reine Funktion ohne DB und ohne 'server-only': dadurch testbar
 * und in Server- wie Client-Komponenten verwendbar. Der Aufrufer besorgt
 * die Rollennamen, hier entsteht nur der Text.
 */

export type UserClass = 'staff' | 'resident' | 'owner' | 'platform';

const CLASS_LABEL: Record<UserClass, string> = {
  staff: 'Mitarbeiter',
  resident: 'Bewohner',
  owner: 'Eigentümer',
  // Der Zusatz "· Plattform" ist kein Schmuck. Der Betreiber hat zwei
  // Zugaenge unter derselben E-Mail: den Plattform-Bereich ueber alle
  // Mandanten hinweg und seinen eigenen Mandanten, in dem er die Rolle
  // "Superadministrator" traegt. Stuende in beiden Bereichen nur
  // "Superadministrator", saehe er nirgends, in welchem er gerade ist —
  // genau der Irrtum, gegen den dieses Label gebaut wurde.
  platform: 'Superadministrator · Plattform',
};

export interface UserRoleLabelInput {
  userClass: UserClass;
  /** Nur fuer `staff` relevant: Inhaber-Flag aus memberships.is_owner. */
  isOwner?: boolean;
  /** Namen der zugewiesenen Rollen, wie sie der Mandant benannt hat. */
  roleNames?: readonly string[];
}

/**
 * Ergibt z. B. "Inhaber · Administrator", "Mitarbeiter · Gärtner" oder
 * schlicht "Bewohner".
 *
 * Der Fall ohne Rolle wird ausdruecklich benannt statt weggelassen. Ein
 * Mitarbeiter ohne Rollenzuweisung sieht eine Oberflaeche ohne Navigation
 * und ohne Aktionen; "keine Rolle zugewiesen" sagt ihm, dass das eine
 * Einstellung ist und kein Defekt — und seinem Chef, wo er nachsehen muss.
 */
export function formatUserRoleLabel(input: UserRoleLabelInput): string {
  const { userClass, isOwner = false, roleNames = [] } = input;

  const base = userClass === 'staff' && isOwner ? 'Inhaber' : CLASS_LABEL[userClass];

  // Nur der Staff-Bereich kennt frei benannte Rollen. Bewohner und
  // Eigentuemer haengen an ihrem Datensatz, nicht an einer Rolle — dort
  // waere ein zweiter Teil eine Behauptung ohne Deckung.
  if (userClass !== 'staff') return base;

  const named = roleNames.map((n) => n.trim()).filter((n) => n.length > 0);
  if (named.length === 0) return `${base} · keine Rolle zugewiesen`;

  return `${base} · ${named.join(', ')}`;
}

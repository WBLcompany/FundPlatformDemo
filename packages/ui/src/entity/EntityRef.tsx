/**
 * Every mention of an entity goes through here (R-097): a link for someone who
 * may view it, the name alone for someone who may not. The permission is
 * decided on the server and arrives as `href` present or absent — this
 * component never decides access itself.
 */
export type EntityRefData = { kind: string; id: string; label: string; href?: string | null; ref?: string };

export function EntityRef({ entity }: { entity: EntityRefData }) {
  const ref = entity.ref ? <span dir="ltr" className="ms-1 font-mono text-caption text-text-muted">{entity.ref}</span> : null;
  if (!entity.href) {
    return <span data-entity-ref={entity.kind} className="text-text">{entity.label}{ref}</span>;
  }
  return (
    <a data-entity-ref={entity.kind} href={entity.href} className="text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-focus">
      {entity.label}{ref}
    </a>
  );
}

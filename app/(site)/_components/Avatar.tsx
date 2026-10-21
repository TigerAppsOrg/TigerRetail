import { initials } from "@/lib/rules";

/* A profile photo, or the person's initials on a tinted circle. */
export function Avatar({ person, size = 32 }: { person: { netid: string; displayName?: string | null; avatarUrl?: string | null }; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }} aria-hidden="true">
      {person.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- small, already downscaled on upload
        <img src={person.avatarUrl} alt="" />
      ) : (
        initials(person)
      )}
    </span>
  );
}

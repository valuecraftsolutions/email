import Link from 'next/link';

export default function Brand({ href = '/', suffix }) {
  return (
    <Link href={href} className="brand">
      <span className="brand__mark" aria-hidden="true">
        V
      </span>
      <span className="brand__name">
        ValueCraft <span>Mail</span>
      </span>
      {suffix && <span className="brand__suffix">{suffix}</span>}
    </Link>
  );
}

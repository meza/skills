export function Metric({
  label,
  tone = 'muted',
  value
}: {
  label: string;
  tone?: 'muted' | 'pass' | 'primary';
  value: string;
}) {
  return (
    <div className='metric'>
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}
